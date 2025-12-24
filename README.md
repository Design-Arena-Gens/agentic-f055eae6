# Gmail ↔ Notion Agent

Web control center that lets you run Gmail and Notion workflows from one place. The UI is powered by Next.js (App Router) and talks to an API route that connects to both services via their official SDKs.

## Features

- List recent Gmail messages (with sender, subject, snippet, labels)
- Send new Gmail messages by composing inline
- Query a Notion database with optional property filters
- Create new Notion pages with rich text content
- Single dashboard to run actions and inspect JSON responses

## Requirements

Set the following environment variables before running locally or deploying:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REFRESH_TOKEN=""
GOOGLE_REDIRECT_URI=""
NOTION_API_KEY=""
NOTION_DATABASE_ID=""
NOTION_DATA_SOURCE_ID=""
```

### Gmail

1. Create a Google Cloud project with Gmail API enabled.
2. Configure an OAuth client (type: Desktop or Web). Put its ID/secret in the variables above.
3. Generate a refresh token for the account the agent should use.

### Notion

1. Create an internal integration in Notion and copy its API key.
2. Share the target database with that integration.
3. Copy the database ID (the 32-character UUID from the URL).
4. Open the database in Notion, choose **More → Connect to data source** and copy the data source ID from the share URL (or via the Notion API explorer). Use that for `NOTION_DATA_SOURCE_ID`.

## Getting Started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to use the dashboard.

## Available Scripts

- `npm run dev` – start the local development server
- `npm run build` – build the production bundle
- `npm run start` – run the production build
- `npm run lint` – run ESLint

## Deployment

The project is ready to deploy on Vercel. Ensure the environment variables are configured in the Vercel dashboard or via `vercel env`.
