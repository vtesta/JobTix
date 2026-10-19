import type { PlanId } from './types';

export const APP_NAME = 'TradeDesk';
export const APP_TAGLINE = 'Trade job ticket management for the trades';
export const TRIAL_DAYS = 14;

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  seats: number;
  blurb: string;
  features: string[];
  priceId: string;
}

export const PLANS: Plan[] = [
  {
    id: 'solo',
    name: 'Solo',
    price: 19,
    seats: 3,
    blurb: 'For owner-operators getting organized.',
    features: ['3 employee seats', 'Unlimited job tickets', 'Timeclock & punch cards', 'Email ticket delivery'],
    priceId: 'price_1UROqfGiWf3UOMIU4GUsfnCi',
  },
  {
    id: 'team',
    name: 'Team',
    price: 49,
    seats: 15,
    blurb: 'For growing crews across multiple jobs.',
    features: ['15 employee seats', 'Everything in Solo', 'QuickBooks-ready exports', 'Priority support'],
    priceId: 'price_1UROr6GiWf3UOMIUUd2H6Xn0',
  },
  {
    id: 'business',
    name: 'Business',
    price: 99,
    seats: 50,
    blurb: 'For established shops running many crews.',
    features: ['50 employee seats', 'Everything in Team', 'Advanced reporting', 'Priority phone support'],
    priceId: 'price_1UROsCGiWf3UOMIU2gzTAmLa',
  },
];

export const planById = (id: PlanId): Plan | undefined => PLANS.find((p) => p.id === id);

export const PLAN_SEATS: Record<PlanId, number> = { free: 3, solo: 3, team: 15, business: 50 };
