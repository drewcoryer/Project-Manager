import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { publicErrorDetail } from "@/lib/granola-db";

function callbackUrl(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}/api/auth/callback/slack`;
}

function settingsError(req: NextRequest, error: string, detail?: unknown) {
  const url = new URL("/settings", req.url);
  url.searchParams.set("error", error);
  if (detail) url.searchParams.set("detail", publicErrorDetail(detail).slice(0, 220));
  return NextResponse.redirect(url);
}

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
    if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
      return settingsError(req, "slack_env_missing");
    }

    const name = req.nextUrl.searchParams.get("name") || "Workspace";
    const clientKey = req.nextUrl.searchParams.get("client_key") || "";
    const redirectUri = callbackUrl(req);

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
      client_id: process.env.SLACK_CLIENT_ID,
      user_scope: scopes, // user_scope for user tokens (not scope for bot tokens)
      redirect_uri: redirectUri,
      state: JSON.stringify({ name, clientKey, userId, redirectUri }),
    });

    return NextResponse.redirect(
      `https://slack.com/oauth/v2/authorize?${params.toString()}`
    );
  }

  // Step 2: OAuth callback
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");

  if (!code || !stateRaw) {
    return settingsError(req, "missing_code");
  }

  try {
    if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
      return settingsError(req, "slack_env_missing");
    }

    const state = JSON.parse(stateRaw);
    const redirectUri = typeof state.redirectUri === "string" ? state.redirectUri : callbackUrl(req);

    // Exchange code for user token
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });

    const data = await tokenRes.json();

    if (!data.ok || !data.authed_user?.access_token) {
      console.error("Slack token exchange failed:", data);
      return settingsError(req, "slack_token_failed", data);
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

    const { error: workspaceError } = await supabase.from("workspaces").upsert(
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

    if (workspaceError) {
      console.error("Slack workspace save failed:", workspaceError);
      return settingsError(req, "workspace_save_failed", workspaceError);
    }

    return NextResponse.redirect(
      new URL(`/settings?connected=slack&name=${encodeURIComponent(teamName)}`, req.url)
    );
  } catch (err) {
    console.error("Slack OAuth callback error:", err);
    return settingsError(req, "slack_callback_failed", err);
  }
}
