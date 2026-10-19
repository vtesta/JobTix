import Stripe from "npm:stripe@14.25.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SEAT_LIMITS: Record<string, number> = {
  solo: 3,
  team: 15,
  business: 50,
};

const PLAN_MAP: Record<string, string> = {
  price_1UROqfGiWf3UOMIU4GUsfnCi: "solo",
  price_1UROr6GiWf3UOMIUUd2H6Xn0: "team",
  price_1UROsCGiWf3UOMIU2gzTAmLa: "business",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sig = req.headers.get("stripe-signature");
    if (!sig || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing signature or webhook secret" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id;
        const planId = session.metadata?.plan_id;
        if (!orgId) break;
        const update: Record<string, unknown> = {
          stripe_subscription_id: session.subscription as string,
          subscription_status: "active",
        };
        if (planId) {
          update.subscription_plan = planId;
          update.seat_limit = SEAT_LIMITS[planId] ?? 3;
        }
        await supabaseAdmin.from("organizations").update(update).eq("id", orgId);
        if (session.customer) {
          await ensureCustomerRow(supabaseAdmin, session.customer as string, session.metadata?.user_id);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        if (!orgId) break;
        const priceId = sub.items.data[0]?.price?.id ?? "";
        const planId = PLAN_MAP[priceId] ?? sub.metadata?.plan_id ?? "free";
        const status = sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : sub.status === "canceled" ? "canceled" : sub.status === "unpaid" ? "canceled" : "active";
        await supabaseAdmin.from("organizations").update({
          stripe_subscription_id: sub.id,
          subscription_plan: planId,
          subscription_status: status,
          seat_limit: SEAT_LIMITS[planId] ?? 3,
        }).eq("id", orgId);
        await syncSubscriptionRow(supabaseAdmin, sub, priceId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        if (!orgId) break;
        await supabaseAdmin.from("organizations").update({
          subscription_status: "canceled",
          subscription_plan: "free",
          seat_limit: 3,
        }).eq("id", orgId);
        await supabaseAdmin.from("stripe_subscriptions")
          .update({ status: "canceled", deleted_at: new Date().toISOString() })
          .eq("subscription_id", sub.id);
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Webhook failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function ensureCustomerRow(
  supabaseAdmin: ReturnType<typeof createClient>,
  customerId: string,
  userId?: string
) {
  const { data: existing } = await supabaseAdmin
    .from("stripe_customers")
    .select("id")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing) return;
  await supabaseAdmin.from("stripe_customers").insert({
    customer_id: customerId,
    ...(userId ? { user_id: userId } : {}),
  });
}

async function syncSubscriptionRow(
  supabaseAdmin: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
  priceId: string
) {
  const customerId = sub.customer as string;
  await ensureCustomerRow(supabaseAdmin, customerId, sub.metadata?.user_id);
  const item = sub.items.data[0];
  const row = {
    customer_id: customerId,
    subscription_id: sub.id,
    price_id: priceId,
    status: sub.status,
    current_period_start: item?.current_period_start ?? 0,
    current_period_end: item?.current_period_end ?? 0,
    cancel_at_period_end: sub.cancel_at_period_end,
    deleted_at: null,
  };
  await supabaseAdmin.from("stripe_subscriptions").upsert(row, { onConflict: "subscription_id" });
}
