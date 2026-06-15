import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Slack OAuth v2 flow for connecting workspaces.
// Supports both owned (GTM Garden, GTM Consulting) and client workspaces
// where Drew is a member. Uses user tokens, not bot tokens.
//
// Usage: GET /api/auth/callback/slack?action=connect&name=Charm&client_key=charm
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const action = req.nextUrl.searchParams.get("action");

  // Step 1: Initiate OAuth
  if (action === "connect") {
    const name = req.nextUrl.searchParams.get("name") || "Workspace";
    const clientKey = req.nextUrl.searchParams.get("client_key") || "";

    // User token scopes - read-only access to channels, messages, search
    const scopes = [
      "channels:read",
      "channels:history",
      "groups:read",
      "groups:history",
      "im:read",
      "im:history",
      "mpim:read",
      "mpim:history",
      "search:read",
      "users:read",
      "users:read.email",
    ].join(",");

    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      user_scope: scopes, // user_scope for user tokens (not scope for bot tokens)
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/slack`,
      state: JSON.stringify({ name, clientKey, userId }),
    });

    return NextResponse.redirect(
      `https://slack.com/oauth/v2/authorize?${params.toString()}`
    );
  }

  // Step 2: OAuth callback
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");

  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL("/settings?error=missing_code", req.url));
  }

  try {
    const state = JSON.parse(stateRaw);

    // Exchange code for user token
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/slack`,
      }),
    });

    const data = await tokenRes.json();

    if (!data.ok || !data.authed_user?.access_token) {
      console.error("Slack token exchange failed:", data);
      return NextResponse.redirect(new URL("/settings?error=slack_token_failed", req.url));
    }

    const teamId = data.team?.id;
    const teamName = data.team?.name || state.name;
    const userToken = data.authed_user.access_token;

    // Store in Supabase
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from("workspaces").upsert(
      {
        type: "slack",
        name: teamName,
        client_key: state.clientKey || null,
        workspace_id: teamId,
        access_token: userToken,
        is_connected: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "type,workspace_id" }
    );

    return NextResponse.redirect(
      new URL(`/settings?connected=slack&name=${encodeURIComponent(teamName)}`, req.url)
    );
  } catch (err) {
    console.error("Slack OAuth callback error:", err);
    return NextResponse.redirect(new URL("/settings?error=callback_failed", req.url));
  }
}
