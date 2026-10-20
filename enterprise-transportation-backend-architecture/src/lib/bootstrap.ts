/**
 * Idempotent runtime bootstrap.
 *
 * Seeds the deterministic pricing rules, Claude Project knowledge artifacts and a
 * small 24-hour operational snapshot (shifts, receivables, communications) so the
 * console and Module C have realistic data on first boot. Safe to call on every
 * request: the work happens once per process and every insert is conflict-guarded.
 */
import { count } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationLogs,
  invoices,
  knowledgeDocuments,
  pricingRules,
  shifts,
} from "@/db/schema";
import { COMMUNICATION_SEED, KNOWLEDGE_SEED, PRICING_SEED } from "@/lib/seed-data";

type SeedGlobal = typeof globalThis & { __pssSeeded?: Promise<void> };
const globalForSeed = globalThis as SeedGlobal;

async function seed(): Promise<void> {
  await db.insert(pricingRules).values(PRICING_SEED).onConflictDoNothing({
    target: pricingRules.vehicleClass,
  });

  await db
    .insert(knowledgeDocuments)
    .values(
      KNOWLEDGE_SEED.map((doc) => ({
        slug: doc.slug,
        name: doc.name,
        category: doc.category,
        description: doc.description,
        xmlContent: doc.xmlContent,
      })),
    )
    .onConflictDoNothing({ target: knowledgeDocuments.slug });

  const [commsCount] = await db.select({ value: count() }).from(communicationLogs);
  if ((commsCount?.value ?? 0) === 0) {
    await db.insert(communicationLogs).values(
      COMMUNICATION_SEED.map((entry) => ({
        channel: entry.channel,
        customerName: entry.customerName,
        subject: entry.subject,
        content: entry.content,
        responseTimeSeconds: entry.responseTimeSeconds,
        receivedAt: new Date(Date.now() - entry.minutesAgo * 60 * 1000),
      })),
    );
  }

  const now = Date.now();
  await db
    .insert(shifts)
    .values([
      {
        externalId: "seed-shift-001",
        driverId: "DRV-204",
        driverName: "A. Delgado",
        tripsCompleted: 8,
        totalRevenue: "1640.00",
        incidentFlags: ["Late arrival — I-15 closure, guest notified"],
        completedAt: new Date(now - 9 * 60 * 60 * 1000),
      },
      {
        externalId: "seed-shift-002",
        driverId: "DRV-118",
        driverName: "M. Cardenas",
        tripsCompleted: 11,
        totalRevenue: "2285.50",
        incidentFlags: [],
        completedAt: new Date(now - 14 * 60 * 60 * 1000),
      },
      {
        externalId: "seed-shift-003",
        driverId: "DRV-077",
        driverName: "T. Okonkwo",
        tripsCompleted: 6,
        totalRevenue: "1310.00",
        incidentFlags: ["Waiting time exceeded 60 minutes — billed per policy"],
        completedAt: new Date(now - 21 * 60 * 60 * 1000),
      },
    ])
    .onConflictDoNothing({ target: shifts.externalId });

  await db
    .insert(invoices)
    .values([
      {
        externalId: "seed-invoice-001",
        invoiceNumber: "PSS-2026-0391",
        corporateName: "Red Rock Gaming Group",
        billingContactEmail: "accounts.payable@redrockgaming.example",
        balanceDue: "8420.50",
        daysPastDue: 47,
        dueDate: new Date(now - 47 * 24 * 60 * 60 * 1000),
        status: "tracked",
      },
      {
        externalId: "seed-invoice-002",
        invoiceNumber: "PSS-2026-0422",
        corporateName: "Summit Hospitality Trust",
        billingContactEmail: "ap@summithospitality.example",
        balanceDue: "1290.00",
        daysPastDue: 12,
        dueDate: new Date(now - 12 * 24 * 60 * 60 * 1000),
        status: "tracked",
      },
      {
        externalId: "seed-invoice-003",
        invoiceNumber: "PSS-2026-0318",
        corporateName: "Canyon Ridge Partners",
        billingContactEmail: "finance@canyonridge.example",
        balanceDue: "3175.75",
        daysPastDue: 83,
        dueDate: new Date(now - 83 * 24 * 60 * 60 * 1000),
        status: "tracked",
      },
    ])
    .onConflictDoNothing({ target: invoices.externalId });
}

export function ensureSeeded(): Promise<void> {
  if (!globalForSeed.__pssSeeded) {
    globalForSeed.__pssSeeded = seed().catch((error) => {
      globalForSeed.__pssSeeded = undefined;
      throw error;
    });
  }
  return globalForSeed.__pssSeeded;
}
