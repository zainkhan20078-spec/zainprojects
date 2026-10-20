/**
 * Seed content for the Claude Project knowledge base and the deterministic
 * pricing engine. These values are inserted once (idempotently) at runtime.
 */

export const FLEET_MANIFEST_XML = `<fleet_manifest version="2026.1" operator="Personal Sedan Services" base="Las Vegas, NV">
  <staging_rules>
    <rule>Vehicles are staged 15 minutes before pickup. The chauffeur never arrives at the curb before the passenger is visible or the flight has landed.</rule>
    <rule>All vehicles must be detailed and interior-inspected before every dispatch. Water, phone chargers and a quiet cabin are standard, not upsells.</rule>
    <rule>Vehicle assignment is final on the manifest. Do not promise a class that is not listed below.</rule>
  </staging_rules>
  <vehicle_classes>
    <vehicle class="sedan" code="SEDAN" label="Executive Sedan">
      <example>Cadillac XTS, Mercedes-Benz E-Class, BMW 5 Series</example>
      <passengers>3</passengers><baggage>3</baggage>
      <chauffeur_attire>Dark suit, tie, white gloves on airport arrivals.</chauffeur_attire>
      <use_cases>Airport transfers, single executive roadshows, discreet point-to-point.</use_cases>
    </vehicle>
    <vehicle class="vip_suv" code="VIP_SUV" label="VIP SUV">
      <example>Cadillac Escalade ESV, Chevrolet Suburban, Mercedes-Benz GLS</example>
      <passengers>6</passengers><baggage>6</baggage>
      <chauffeur_attire>Dark suit, no tie after 20:00 local.</chauffeur_attire>
      <use_cases>Families, small boards, golf bags, oversized luggage.</use_cases>
    </vehicle>
    <vehicle class="executive_sprinter" code="SPRINTER" label="Executive Sprinter">
      <example>Mercedes-Benz Sprinter 2500 with conference seating</example>
      <passengers>12</passengers><baggage>12</baggage>
      <chauffeur_attire>Dark suit, tie, white gloves at all times.</chauffeur_attire>
      <use_cases>Roadshows, boards, convention delegations, production crews.</use_cases>
    </vehicle>
  </vehicle_classes>
  <substitution_policy>
    <rule>Upgrades at no additional charge are permitted when the reserved class is unavailable.</rule>
    <rule>Downgrades require dispatch approval. Never downgrade a corporate account without written notice.</rule>
  </substitution_policy>
</fleet_manifest>`;

export const LAS_AIRPORT_XML = `<las_airport_procedures version="2026.1" airport="Harry Reid International Airport (LAS)" city="Las Vegas">
  <terminals>
    <terminal name="Terminal 1" airlines="Southwest, Spirit, Allegiant, Frontier, domestic low-cost" baggage_claim="Level 0" />
    <terminal name="Terminal 3" airlines="Delta, American, United, Alaska, JetBlue, all international arrivals" baggage_claim="Level 0 international arrivals hall" />
  </terminals>
  <meet_and_greet>
    <trigger>Corporate accounts, VIP SUV and Executive Sprinter reservations, unaccompanied minors, international arrivals, and any passenger with 3+ checked bags.</trigger>
    <procedure>Chauffeur meets the passenger at baggage claim holding a Personal Sedan Services tablet sign with the passenger surname only. No company branding is shouted aloud.</procedure>
    <timing>Chauffeur enters the terminal 10 minutes after wheels-down. Flight is tracked live; arrival time is recalculated automatically.</timing>
    <waiting_time>60 complimentary minutes from wheels-down. Thereafter billed at the prevailing hourly rate in 15-minute increments.</waiting_time>
  </meet_and_greet>
  <curbside_pickup>
    <trigger>Sedan point-to-point transfers with carry-on only, and corporate travellers who explicitly request curbside.</trigger>
    <procedure>Passenger is directed to the outer curb of the ticketed terminal between pillars. Chauffeur may hold curbside for 5 minutes maximum; airport enforcement tows after that.</procedure>
    <limo_holding>When curbside holding is unavailable, the chauffeur stages in the designated limousine lot on Level 0 and re-enters on passenger notification.</limo_holding>
  </curbside_pickup>
  <arrivals_discipline>
    <rule>Chauffeurs never call the passenger before wheels-down unless the flight is delayed more than 30 minutes.</rule>
    <rule>Every inbound flight is verified against the airline record before the manifest is released.</rule>
    <rule>Late-night arrivals after 23:00 local are greeted curbside by default to reduce terminal congestion risk.</rule>
  </arrivals_discipline>
  <communication_templates>
    <template event="flight_delay">"Good evening, [Surname]. We have you arriving at [time] on [airline] [flight]. Your chauffeur will be at baggage claim, Terminal [n]. Your rate is unchanged."</template>
    <template event="chauffeur_on_site">"Good evening, [Surname]. Your chauffeur, [Name], is on site. Vehicle: [black sedan / black SUV]. Reply to this message if you need assistance with luggage."</template>
  </communication_templates>
</las_airport_procedures>`;

export const CORPORATE_PRICING_XML = `<corporate_pricing_rules version="2026.1" effective="2026-01-01" currency="USD">
  <billing_models>
    <model name="airport_flat" applies="LAS airport transfers" rule="Flat rate per vehicle class, inclusive of airport fee and fuel surcharge. Gratuity is itemized at 20%." />
    <model name="hourly_disposal" applies="As-directed hourly service" rule="Minimum 3 hours per vehicle class. Billed in 30-minute increments thereafter. Overtime is agreed in writing before the chauffeur is released." />
    <model name="mileage" applies="Point-to-point non-airport, outside Clark County" rule="Per-mile rate plus the prevailing hourly minimum when road time exceeds the minimum. Mileage starts at the pickup address and ends at the final dropoff." />
    <model name="convention_flat" applies="Las Vegas Convention Center, Wynn, Venetian Expo, Caesars Forum, Mandalay Bay" rule="Convention flat rates apply only during published event windows. Outside a window, mileage billing applies." />
  </billing_models>
  <constraints>
    <constraint>Quoted totals must be presented as: base rate, airport fee (if applicable), fuel surcharge, gratuity and total. Never quote a rounded estimate.</constraint>
    <constraint>No AI-generated document may alter a Limo Anywhere quoted fare. If the calculated guardrail total differs from the dispatch fare by more than 5%, the draft must say the fare is pending dispatch review.</constraint>
    <constraint>Corporate accounts on 30-day net terms receive the contracted rate. Retail clients prepay. Do not extend credit.</constraint>
    <constraint>Discounts, hold fees and no-show fees are outside AI scope and require a human account executive.</constraint>
    <constraint>Mileage uncertainty: when the route cannot be resolved, quote the hourly minimum and state that exact mileage will be confirmed by dispatch.</constraint>
  </constraints>
  <resolved_lanes>
    <lane from="LAS" to="Las Vegas Strip" miles="3.5" minutes="15" mode="airport_flat" />
    <lane from="LAS" to="Downtown Las Vegas" miles="11.0" minutes="22" mode="airport_flat" />
    <lane from="LAS" to="Henderson" miles="17.0" minutes="28" mode="airport_flat" />
    <lane from="LAS" to="Summerlin" miles="21.0" minutes="32" mode="airport_flat" />
    <lane from="LAS" to="Lake Las Vegas" miles="23.0" minutes="34" mode="airport_flat" />
    <lane from="Las Vegas Strip" to="Las Vegas Convention Center" miles="2.2" minutes="12" mode="convention_flat" />
  </resolved_lanes>
</corporate_pricing_rules>`;

export const BRAND_VOICE_XML = `<brand_identity version="2026.1">
  <identity>
    <name>Personal Sedan Services</name>
    <established>2000</established>
    <headquarters>Las Vegas, Nevada</headquarters>
    <positioning>Discreet, exacting chauffeured transportation for executives, boards and their guests.</positioning>
  </identity>
  <voice>
    <attribute>Hyper-formal. Never casual, never familiar.</attribute>
    <attribute>Concise. Zero fluff, zero filler, zero exclamation marks.</attribute>
    <attribute>Respectful. Address the guest by honored surname.</attribute>
    <attribute>Luxury-focused. Restraint is the signal; never list features as sales copy.</attribute>
  </voice>
  <prohibitions>
    <prohibition>Do not use emoji, slang, contractions in formal drafts, or marketing superlatives.</prohibition>
    <prohibition>Do not invent pricing, availability, drivers, flight times or amenities.</prohibition>
    <prohibition>Do not disclose other passengers, other corporate accounts, or internal escalation notes.</prohibition>
  </prohibitions>
  <signature>Personal Sedan Services · Reservations · Las Vegas, Nevada · (702) 555-0140</signature>
</brand_identity>`;

export type SeedKnowledgeDoc = {
  slug: string;
  name: string;
  category: "system_instruction" | "knowledge_artifact";
  description: string;
  xmlContent: string;
};

export const KNOWLEDGE_SEED: SeedKnowledgeDoc[] = [
  {
    slug: "brand-identity",
    name: "Brand Identity & Voice",
    category: "system_instruction",
    description:
      "Core brand voice guardrails injected into every Claude call: hyper-formal, concise, luxury-first.",
    xmlContent: BRAND_VOICE_XML,
  },
  {
    slug: "fleet-manifest",
    name: "Fleet Manifest & Staging Rules",
    category: "knowledge_artifact",
    description:
      "Vehicle classes (Sedan, VIP SUV, Executive Sprinter), capacities, chauffeur attire and staging discipline.",
    xmlContent: FLEET_MANIFEST_XML,
  },
  {
    slug: "las-airport-procedures",
    name: "LAS Airport Meet & Greet Procedures",
    category: "knowledge_artifact",
    description:
      "Terminal guidance, baggage claim meet-and-greet versus curbside pickup, holding and waiting-time rules at Harry Reid International.",
    xmlContent: LAS_AIRPORT_XML,
  },
  {
    slug: "corporate-pricing-rules",
    name: "Corporate Pricing & Billing Constraints",
    category: "knowledge_artifact",
    description:
      "Convention flat rates versus mileage billing, itemized rate presentation and AI pricing prohibitions.",
    xmlContent: CORPORATE_PRICING_XML,
  },
];

export type SeedPricingRule = {
  vehicleClass: string;
  displayName: string;
  flatAirportRate: string;
  hourlyMinimum: string;
  hourlyRate: string;
  perMileRate: string;
  airportFee: string;
  fuelSurcharge: string;
  gratuityPct: string;
  passengerCapacity: number;
  baggageCapacity: number;
  notes: string;
};

export const PRICING_SEED: SeedPricingRule[] = [
  {
    vehicleClass: "sedan",
    displayName: "Executive Sedan",
    flatAirportRate: "95.00",
    hourlyMinimum: "285.00",
    hourlyRate: "95.00",
    perMileRate: "4.75",
    airportFee: "12.00",
    fuelSurcharge: "6.00",
    gratuityPct: "20.00",
    passengerCapacity: 3,
    baggageCapacity: 3,
    notes: "Default airport transfer class. Meet-and-greet included for corporate accounts.",
  },
  {
    vehicleClass: "vip_suv",
    displayName: "VIP SUV",
    flatAirportRate: "145.00",
    hourlyMinimum: "375.00",
    hourlyRate: "125.00",
    perMileRate: "6.25",
    airportFee: "12.00",
    fuelSurcharge: "8.00",
    gratuityPct: "20.00",
    passengerCapacity: 6,
    baggageCapacity: 6,
    notes: "Staging for boards and families. Baggage-claim meet-and-greet is standard at LAS.",
  },
  {
    vehicleClass: "executive_sprinter",
    displayName: "Executive Sprinter",
    flatAirportRate: "215.00",
    hourlyMinimum: "485.00",
    hourlyRate: "165.00",
    perMileRate: "8.50",
    airportFee: "18.00",
    fuelSurcharge: "10.00",
    gratuityPct: "20.00",
    passengerCapacity: 12,
    baggageCapacity: 12,
    notes: "Convention and delegation work. Flat convention rates require a published event window.",
  },
];

/** Demo inbound communications so Module C has a realistic 24h batch to audit. */
export const COMMUNICATION_SEED: Array<{
  channel: "email" | "phone";
  customerName: string;
  subject: string;
  content: string;
  responseTimeSeconds: number;
  minutesAgo: number;
}> = [
  {
    channel: "email",
    customerName: "M. Whitcombe",
    subject: "LAS arrival Thursday 6:40pm",
    content:
      "Good afternoon. We require a sedan from Harry Reid on Thursday, arriving Delta 1042 at 18:40, to the Wynn. Two passengers, one checked bag. Please confirm the rate and the meet-and-greet arrangement.",
    responseTimeSeconds: 318,
    minutesAgo: 40,
  },
  {
    channel: "email",
    customerName: "A. Petrov",
    subject: "Sprinters for board offsite",
    content:
      "We need two Executive Sprinters for a board offsite on the 18th, held hourly from 09:00 to 17:00, departing from the Palazzo. Kindly provide an itemized proposal.",
    responseTimeSeconds: 612,
    minutesAgo: 95,
  },
  {
    channel: "phone",
    customerName: "R. Castellanos",
    subject: "Transcript: roadside delay on I-15",
    content:
      "Caller: 'I'm in the SUV, we've been stopped on I-15 for nine minutes.' Chauffeur: 'There is a collision ahead of Spring Mountain. I am rerouting via Industrial and will hold the corridor. Your arrival at the Bellagio is now 21:52.' Caller: 'Understood. Please tell the restaurant.' Agent: 'Logged. The restaurant has been notified on your behalf.'",
    responseTimeSeconds: 46,
    minutesAgo: 210,
  },
  {
    channel: "email",
    customerName: "C. Okafor",
    subject: "Convention flat rate question",
    content:
      "Does your convention flat rate include gratuity and fuel? We are attending a trade show at the Convention Center in March and are comparing three providers.",
    responseTimeSeconds: 1450,
    minutesAgo: 320,
  },
  {
    channel: "phone",
    customerName: "J. Lindqvist",
    subject: "Transcript: lost item follow-up",
    content:
      "Agent: 'Good evening. Your chauffeur recovered the folio from the rear seat pocket and has secured it in the dispatch office.' Caller: 'That is excellent. I am in the Wynn Salon tower until Friday.' Agent: 'We will courier it tonight to the tower concierge and confirm receipt.'",
    responseTimeSeconds: 88,
    minutesAgo: 430,
  },
  {
    channel: "email",
    customerName: "S. Ahmadi",
    subject: "Last-minute downtown transfer",
    content:
      "I need a sedan from the Strip to downtown in forty minutes. What is the fare? I understand short notice may carry a premium.",
    responseTimeSeconds: 2200,
    minutesAgo: 700,
  },
];
