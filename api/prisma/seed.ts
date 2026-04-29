import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env from repo root before importing Prisma client.
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const EVENT = {
  title: 'Southeast Asia AI Summit 2026',
  startsAt: new Date('2026-05-15T09:00:00+07:00'),
  endsAt: new Date('2026-05-17T18:00:00+07:00'),
  location: 'Jakarta, Indonesia',
};

// 15 attendees with overlapping verticals so the matching agent has signal to work with.
// Verticals: AI/ML, climate tech, fintech, B2B SaaS. Roles: founders, investors, engineers,
// designer, operator. Embeddings will be populated by AttendeesService.create() in Phase 6.
const ATTENDEES = [
  {
    name: 'Sarah Lim',
    headline: 'Founder & CEO at LedgerAI',
    bio: 'Building LedgerAI, a B2B finance automation platform serving SMEs in Southeast Asia. Pre-seed raised, ~3 paying customers. Background in fintech (ex-DBS) with a CS degree from NUS.',
    company: 'LedgerAI',
    role: 'founder',
    skills: ['fintech', 'b2b-saas', 'product', 'go-to-market', 'leadership'],
    lookingFor:
      'A backend co-founder who has scaled B2B SaaS before. Strong NestJS / TypeScript stack preferred. Indonesia or Singapore based.',
    openToChat: true,
  },
  {
    name: 'Rizky Pratama',
    headline: 'Founder at ClimateOS',
    bio: 'Founder of ClimateOS. We help Indonesian palm oil mills measure and reduce emissions. Currently piloting with 4 mills in Sumatra. Ex-McKinsey, climate analyst at WRI Indonesia.',
    company: 'ClimateOS',
    role: 'founder',
    skills: ['climate-tech', 'b2b', 'sustainability', 'partnerships', 'data'],
    lookingFor:
      'A senior ML engineer or co-founder who can lead our remote-sensing pipeline (satellite imagery + emissions modelling).',
    openToChat: true,
  },
  {
    name: 'Maya Tan',
    headline: 'Partner at GreenForge Ventures (Series A)',
    bio: 'Partner at GreenForge, a $200M Series A fund focused on climate tech across SEA. Lead checks $3-7M. Past investments include carbon-accounting and grid-management startups.',
    company: 'GreenForge Ventures',
    role: 'investor',
    skills: ['venture-capital', 'climate-tech', 'series-a', 'sea-market'],
    lookingFor:
      'Post-revenue climate tech founders building defensible moats. Especially interested in industrial decarbonization and nature-based solutions.',
    openToChat: true,
  },
  {
    name: 'Alex Chen',
    headline: 'Partner at Volt Capital — AI/ML thesis',
    bio: 'Series A investor at Volt Capital, focused on AI infrastructure and developer tools. Previously founded a YC-backed observability startup (acquired 2023). Active angel in the LLM tooling space.',
    company: 'Volt Capital',
    role: 'investor',
    skills: ['venture-capital', 'ai', 'developer-tools', 'series-a'],
    lookingFor:
      'AI infrastructure founders — agents, evals, embedding stores, finetuning platforms. Pre-Series A through Series A.',
    openToChat: true,
  },
  {
    name: 'Andika Setiawan',
    headline: 'Senior Backend Engineer — looking for AI co-founder role',
    bio: 'Senior backend engineer with 8 years experience scaling Go/NestJS services at Gojek and Tokopedia. Leading a 5-person team at a fintech now but ready to bet on something earlier-stage.',
    company: 'Independent',
    role: 'engineer',
    skills: ['backend', 'go', 'nestjs', 'distributed-systems', 'kafka', 'postgres'],
    lookingFor:
      'Technical co-founder role at an AI startup. B2B SaaS preferred. Open to relocation within SEA. Indonesia native.',
    openToChat: true,
  },
  {
    name: 'Linda Park',
    headline: 'Senior Frontend Engineer at Stripe',
    bio: 'Senior frontend engineer at Stripe (remote, based in Singapore). React, Next.js, design systems. Side project: open-source admin dashboard kit with 12k stars on GitHub.',
    company: 'Stripe',
    role: 'engineer',
    skills: ['frontend', 'react', 'nextjs', 'design-systems', 'typescript'],
    lookingFor:
      'Exploring whether to leave big tech for an early-stage AI/dev-tool startup. Want to chat with founders about what life there is like before deciding.',
    openToChat: true,
  },
  {
    name: 'Bayu Wirawan',
    headline: 'Staff ML Engineer — RAG and LLM evals',
    bio: 'Staff ML engineer with deep experience in retrieval-augmented generation, vector indexes, and LLM evaluation harnesses. Built the search stack at a Series B SaaS that serves 50k businesses.',
    company: 'SearchCo',
    role: 'engineer',
    skills: ['ml', 'llm', 'rag', 'evals', 'pgvector', 'python'],
    lookingFor:
      'Open to senior IC roles or staff+ at AI infra startups. Particularly interested in agent frameworks and eval tooling.',
    openToChat: true,
  },
  {
    name: 'Rachel Kim',
    headline: 'Product Designer — B2B SaaS',
    bio: 'Product designer at a Series B HRtech (Singapore). 6 years in B2B SaaS design, focus on data-heavy admin dashboards and onboarding flows. Speaks at ConfigSG annually.',
    company: 'PeopleStack',
    role: 'designer',
    skills: ['product-design', 'b2b-saas', 'design-systems', 'figma', 'user-research'],
    lookingFor:
      'Looking for a design lead role at an early-stage B2B startup, ideally fintech or AI. Need a strong product-driven founding team.',
    openToChat: true,
  },
  {
    name: 'Diana Putri',
    headline: 'Principal DevOps Engineer — fintech infra',
    bio: 'Principal DevOps engineer at a major Indonesian fintech. Owns multi-region Kubernetes clusters and CI/CD for 200+ services. PCI-DSS lead. Ex-AWS solutions architect.',
    company: 'PayCorp',
    role: 'engineer',
    skills: ['devops', 'kubernetes', 'aws', 'terraform', 'security', 'pci-dss'],
    lookingFor:
      'Currently happy in role but open to advisor or fractional CTO conversations with early-stage fintech.',
    openToChat: false,
  },
  {
    name: 'Jamal Nasir',
    headline: 'Full-stack Engineer (NestJS + React)',
    bio: 'Full-stack engineer who has been the first or second hire at three Indonesian startups. Strong with NestJS, React, Postgres. Ships fast, prefers small teams.',
    company: 'Freelance',
    role: 'engineer',
    skills: ['fullstack', 'nestjs', 'react', 'postgres', 'startup'],
    lookingFor:
      'Co-founding-engineer role at a pre-seed startup. Equity-heavy comp acceptable. Indonesia or remote-friendly.',
    openToChat: true,
  },
  {
    name: 'Kevin Zhao',
    headline: 'Data Scientist — LLM evaluation',
    bio: 'Data scientist focused on building eval harnesses for LLM-based products. Currently at a Series A startup helping them ship reliable agents. Ph.D. in NLP from Stanford.',
    company: 'AgentLab',
    role: 'engineer',
    skills: ['ml', 'llm', 'evals', 'nlp', 'python', 'research'],
    lookingFor:
      'Exploring opportunities to lead an evaluation or research team at a more applied AI company.',
    openToChat: true,
  },
  {
    name: 'Sophia Ahmed',
    headline: 'Founder & CTO at AgentOps (DevTools for AI agents)',
    bio: 'Founder of AgentOps, building observability and replay tooling for production AI agents. Seed raised from Volt Capital and angels. 6-month-old company, 3 paying design partners.',
    company: 'AgentOps',
    role: 'founder',
    skills: ['ai', 'developer-tools', 'observability', 'b2b-saas', 'leadership'],
    lookingFor:
      'A senior technical advisor with experience scaling B2B dev tools and a strong network of LLM-app builders.',
    openToChat: true,
  },
  {
    name: 'Marcus Thompson',
    headline: 'VP Engineering at GridFlow (climate tech, Series B)',
    bio: 'VP Eng at GridFlow, a Series B climate tech company building grid-flexibility software for utilities. Hiring across the engineering org. Previously at Tesla Energy.',
    company: 'GridFlow',
    role: 'operator',
    skills: ['leadership', 'climate-tech', 'distributed-systems', 'hiring', 'python'],
    lookingFor:
      'Hiring senior backend engineers (Python or Go) interested in climate. Also chatting with potential head-of-platform candidates.',
    openToChat: true,
  },
  {
    name: 'Nadia Hassan',
    headline: 'Founder & CEO at NavIQ (B2B insurance AI)',
    bio: 'Founder of NavIQ, applying AI to commercial insurance underwriting. Raised pre-seed from a regional fund. 18 months in, two LOIs from Tier-1 insurers.',
    company: 'NavIQ',
    role: 'founder',
    skills: ['insurtech', 'ai', 'b2b-saas', 'sales', 'leadership'],
    lookingFor:
      'A founding account executive with insurance enterprise sales experience. Singapore or Jakarta based.',
    openToChat: true,
  },
  {
    name: 'Pavlo Kovac',
    headline: 'Solo developer / consultant (TypeScript + AI)',
    bio: 'Independent consultant, 12 years experience, currently focused on shipping LLM-powered features for SMEs. Author of two open-source NestJS plugins.',
    company: 'Independent',
    role: 'engineer',
    skills: ['fullstack', 'typescript', 'nestjs', 'ai', 'consulting'],
    lookingFor:
      'Looking for a long-term collaborator on a B2B AI product — either a partnership, joining as founding engineer, or a strong design-partner relationship.',
    openToChat: true,
  },
];

async function main() {
  console.log('🌱 Resetting demo data…');

  // Wipe in FK-safe order (cascade also handles this, but explicit is clearer).
  await prisma.feedback.deleteMany();
  await prisma.toolCall.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.attendee.deleteMany();
  await prisma.event.deleteMany();

  console.log('🌱 Creating event…');
  const event = await prisma.event.create({ data: EVENT });
  console.log(`   ✓ ${event.title} (${event.id})`);

  console.log(`🌱 Creating ${ATTENDEES.length} attendees…`);
  for (const a of ATTENDEES) {
    await prisma.attendee.create({
      data: { ...a, eventId: event.id },
    });
  }
  console.log(`   ✓ ${ATTENDEES.length} attendees created (embeddings will be populated by the API on real registration).`);

  console.log('🌱 Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
