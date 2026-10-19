import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LOGIN_DOMAIN = "tradedesk.access";
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

function slugifyName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
  return base || "crew";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = body.role === "admin" ? "admin" : "employee";
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    if (!name || name.length > 60) return json({ error: "A member name is required" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return json({ error: "A valid workspace is required" }, 400);

    // Only admins/owners of this workspace may add members.
    const { data: callerMembership, error: membershipError } = await admin
      .from("team_members")
      .select("role, status")
      .eq("user_id", callerId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (membershipError || !callerMembership || callerMembership.status !== "active" ||
        !["owner", "admin"].includes(callerMembership.role)) {
      return json({ error: "Only workspace admins can add team members" }, 403);
    }

    // Seat limit per plan.
    const { data: org } = await admin.from("organizations").select("seat_limit").eq("id", orgId).maybeSingle();
    const seatLimit = org?.seat_limit ?? 3;
    const { count: activeCount } = await admin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active");
    if ((activeCount ?? 0) >= seatLimit) {
      return json({ error: "Seat limit reached for your plan. Upgrade on the Billing page to add more members." }, 409);
    }

    // Generate a unique username + password, then create the account immediately.
    const password = randomString(10);
    let createdUser: { id: string; email: string } | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 6 && !createdUser; attempt++) {
      const username = slugifyName(name) + String(Math.floor(Math.random() * 90) + 10);
      const email = `${username}@${LOGIN_DOMAIN}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, username },
      });
      if (!error) {
        createdUser = { id: data.user.id, email };
      } else if (/already|duplicate|exist/i.test(error.message)) {
        lastError = error.message;
      } else {
        return json({ error: error.message }, 502);
      }
    }
    if (!createdUser) return json({ error: "Could not create a unique account. Try a different name." }, 502);

    const username = createdUser.email.split("@")[0];

    const { error: memberError } = await admin.from("team_members").insert({
      organization_id: orgId,
      user_id: createdUser.id,
      email: createdUser.email,
      name,
      role,
      status: "active",
      invited_by: callerId,
    });
    if (memberError) return json({ error: memberError.message }, 502);

    const { error: employeeError } = await admin.from("employees").insert({
      organization_id: orgId,
      user_id: createdUser.id,
      name,
    });
    if (employeeError) return json({ error: employeeError.message }, 502);

    return json({ sent: true, username, password });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Could not create the team member" },
      500,
    );
  }
});
