/**
 * Mock boundaries. Replace these functions when a real provider is connected.
 * Nothing in this file charges a card, sends a message, or calls a map API.
 */

export const integrationNotes = {
  auth: "Sign-in uses the demo directory in this file’s sibling seed data. Every sample password is demo.",
  payments: "No payment gateway is connected. Confirming a booking does not charge a card.",
  notifications: "Notices stay in this browser. No SMS or email is sent.",
  maps: "Coverage is stored as cities, zones, and postal codes. A map provider is not configured.",
  storage: "Demo records are stored in localStorage on this browser.",
} as const;

export function authorizePayment(amount: number): { processed: false; amount: number; message: string } {
  return {
    processed: false,
    amount,
    message: "No payment was taken. TechCare is not connected to a payment gateway.",
  };
}
