# Project Manager

A client-facing project management portal built with Next.js, Clerk authentication, and Tailwind CSS. Designed to share project plans and progress updates with clients in a professional, branded interface.

## Features

- **Clerk Authentication** - Secure sign-in/sign-up with email, Google, GitHub, etc.
- **Project Dashboard** - Overview of all active projects with progress tracking
- **Detailed Project Views** - Timeline, deliverables, dependencies, and acceptance criteria
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Vercel-Ready** - Optimized for deployment on Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A [Clerk](https://clerk.com) account

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Clerk

1. Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Copy your API keys from the Clerk dashboard
3. Create a `.env.local` file based on `.env.example`:

```bash
cp .env.example .env.local
```

4. Add your Clerk keys:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Deploying to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/project-manager)

### Option 2: Manual Deploy

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com/new)
3. Add environment variables in Vercel:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. Deploy

### Clerk + Vercel Integration

For automatic environment variable sync:
1. Go to your Clerk dashboard
2. Navigate to **Integrations** > **Vercel**
3. Connect your Vercel account
4. Select your project

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Dashboard
│   ├── layout.tsx                  # Root layout with Clerk provider
│   ├── globals.css                 # Global styles
│   ├── sign-in/[[...sign-in]]/     # Sign-in page
│   ├── sign-up/[[...sign-up]]/     # Sign-up page
│   └── projects/[slug]/            # Project detail page
├── components/
│   ├── Header.tsx                  # Navigation header
│   ├── ProjectCard.tsx             # Project card for dashboard
│   ├── StatusBadge.tsx             # Status indicator
│   ├── ProgressBar.tsx             # Progress visualization
│   ├── TimelineDay.tsx             # Sprint day timeline
│   ├── DependenciesList.tsx        # Project dependencies
│   ├── DeliverablesList.tsx        # Project deliverables
│   └── AcceptanceCriteriaList.tsx  # Acceptance criteria
├── data/
│   └── projects.ts                 # Project data (can be replaced with API)
└── middleware.ts                   # Clerk auth middleware
```

## Customization

### Adding Projects

Edit `src/data/projects.ts` to add or modify projects. Each project includes:

- Executive summary
- Deliverables list
- Timeline with tasks
- Dependencies
- Acceptance criteria

### Branding

Update the company name and colors in:
- `src/components/Header.tsx` - Company name
- `src/app/globals.css` - Color variables
- `tailwind.config.ts` - Theme customization

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)
- **Authentication**: [Clerk](https://clerk.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Hosting**: [Vercel](https://vercel.com/)

## License

MIT