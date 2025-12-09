export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string;
}

export interface DayPlan {
  day: number;
  title: string;
  date: string;
  tasks: Task[];
}

export interface Dependency {
  id: string;
  title: string;
  deadline: string;
  completed: boolean;
}

export interface Deliverable {
  id: string;
  title: string;
  description: string;
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  client: string;
  status: "active" | "completed" | "on_hold";
  executiveSummary: string;
  deliverables: Deliverable[];
  timeline: DayPlan[];
  dependencies: Dependency[];
  acceptanceCriteria: AcceptanceCriteria[];
  preparedBy: {
    name: string;
    title: string;
    company: string;
    date: string;
  };
  deliveryDate: string;
}

export const projects: Project[] = [
  {
    id: "webflow-gtm-001",
    slug: "webflow-gtm-data-infrastructure",
    title: "Webflow GTM Data Infrastructure",
    client: "Webflow",
    status: "active",
    executiveSummary:
      "This project establishes foundational GTM data infrastructure in Clay, connecting Salesforce CRM data with Gong conversation intelligence. The deliverables enable Webflow's revenue team to surface enriched account context, track opportunity progression, and leverage conversation insights through reusable lookup functions.",
    deliverables: [
      {
        id: "d1",
        title: "Accounts Primary Table",
        description:
          "Salesforce Account fields with weekly refresh + triggered refresh on activity",
      },
      {
        id: "d2",
        title: "Opportunities Primary Table",
        description:
          "MEDPICC fields with daily refresh for open opps, frozen at close",
      },
      {
        id: "d3",
        title: "Conversations Primary Table",
        description:
          "Gong webhook integration with raw + cleaned transcripts",
      },
      {
        id: "d4",
        title: "Lookup Functions",
        description:
          "Account by Domain, Account by Opp ID, Get Segment, Find Opps by Account, Stage-to-Category, Find Conversations",
      },
      {
        id: "d5",
        title: "Documentation",
        description: "Technical docs + recorded walkthrough handoff",
      },
    ],
    timeline: [
      {
        day: 1,
        title: "Discovery + Accounts",
        date: "Wed Dec 10, 2025",
        tasks: [
          {
            id: "t1-1",
            title: "Obtain Clay workspace access and permissions",
            status: "pending",
          },
          {
            id: "t1-2",
            title: "Receive IT-simplified Salesforce Account field list",
            status: "pending",
          },
          {
            id: "t1-3",
            title: "Confirm Salesforce integration credentials in Clay",
            status: "pending",
          },
          {
            id: "t1-4",
            title: "Build Accounts Primary Table with specified fields",
            status: "pending",
          },
          {
            id: "t1-5",
            title: "Configure weekly refresh + activity triggers",
            status: "pending",
          },
          {
            id: "t1-6",
            title: "Create Account lookup functions (Domain, Opp ID, Segment)",
            status: "pending",
          },
        ],
      },
      {
        day: 2,
        title: "Opportunities",
        date: "Thu Dec 11, 2025",
        tasks: [
          {
            id: "t2-1",
            title: "Build Opportunities Primary Table with MEDPICC fields",
            status: "pending",
          },
          {
            id: "t2-2",
            title: "Configure daily refresh for open opportunities",
            status: "pending",
          },
          {
            id: "t2-3",
            title: "Implement freeze logic for closed opportunities",
            status: "pending",
          },
          {
            id: "t2-4",
            title: "Create Find Opportunities by Account ID function",
            status: "pending",
          },
          {
            id: "t2-5",
            title: "Create Stage-to-Category mapping function",
            status: "pending",
          },
          {
            id: "t2-6",
            title: "Validate Account-to-Opportunity linkage",
            status: "pending",
          },
        ],
      },
      {
        day: 3,
        title: "Conversations + Docs",
        date: "Fri Dec 12, 2025",
        tasks: [
          {
            id: "t3-1",
            title: "Configure Gong webhook for real-time call completion",
            status: "pending",
          },
          {
            id: "t3-2",
            title: "Build Conversations Primary Table (raw + cleaned transcripts)",
            status: "pending",
          },
          {
            id: "t3-3",
            title: "Link via Salesforce Conversation object",
            status: "pending",
          },
          {
            id: "t3-4",
            title: "Create Conversation lookup functions",
            status: "pending",
          },
          {
            id: "t3-5",
            title: "End-to-end testing of all tables and functions",
            status: "pending",
          },
          {
            id: "t3-6",
            title: "Documentation and recorded walkthrough handoff",
            status: "pending",
          },
        ],
      },
    ],
    dependencies: [
      {
        id: "dep1",
        title: "Clay workspace access with admin/builder permissions",
        deadline: "EOD Tue Dec 9",
        completed: false,
      },
      {
        id: "dep2",
        title: "IT-simplified Salesforce Account field list",
        deadline: "EOD Tue Dec 9",
        completed: false,
      },
      {
        id: "dep3",
        title: "Salesforce integration credentials configured in Clay",
        deadline: "EOD Tue Dec 9",
        completed: false,
      },
      {
        id: "dep4",
        title: "Gong API access / webhook configuration permissions",
        deadline: "EOD Tue Dec 9",
        completed: false,
      },
      {
        id: "dep5",
        title: "MEDPICC field definitions for Opportunities",
        deadline: "EOD Tue Dec 9",
        completed: false,
      },
      {
        id: "dep6",
        title: "Technical point of contact for questions",
        deadline: "EOD Tue Dec 9",
        completed: false,
      },
    ],
    acceptanceCriteria: [
      {
        id: "ac1",
        description: "Each deliverable conforms to requirement specifications",
      },
      {
        id: "ac2",
        description:
          "Each deliverable meets applicable warranties in Agreement",
      },
      {
        id: "ac3",
        description: "Documented 100% of acceptance test cases",
      },
      {
        id: "ac4",
        description: "Written approval from Webflow",
      },
    ],
    preparedBy: {
      name: "Drew Coryer",
      title: "Founder",
      company: "GTM Consulting Co.",
      date: "December 9, 2025",
    },
    deliveryDate: "EOD Friday, December 12, 2025",
  },
];

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}
