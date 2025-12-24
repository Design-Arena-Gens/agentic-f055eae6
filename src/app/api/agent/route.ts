import { google } from "googleapis";
import { Client as NotionClient, isFullPageOrDataSource } from "@notionhq/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  action: z.enum([
    "gmail.listMessages",
    "gmail.sendMessage",
    "notion.listPages",
    "notion.createPage",
  ]),
  payload: z.record(z.string(), z.any()).optional(),
});

const gmailEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().min(1),
});

const notionEnvSchema = z.object({
  NOTION_API_KEY: z.string().min(1),
  NOTION_DATABASE_ID: z.string().min(1),
  NOTION_DATA_SOURCE_ID: z.string().min(1),
});

function getGmailClient() {
  const env = gmailEnvSchema.safeParse(process.env);
  if (!env.success) {
    throw new Error(
      "Missing required Gmail environment variables. Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GOOGLE_REDIRECT_URI are set."
    );
  }

  const oauth2Client = new google.auth.OAuth2({
    clientId: env.data.GOOGLE_CLIENT_ID,
    clientSecret: env.data.GOOGLE_CLIENT_SECRET,
    redirectUri: env.data.GOOGLE_REDIRECT_URI,
  });

  oauth2Client.setCredentials({
    refresh_token: env.data.GOOGLE_REFRESH_TOKEN,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

function getNotionClient() {
  const env = notionEnvSchema.safeParse(process.env);
  if (!env.success) {
    throw new Error(
      "Missing required Notion environment variables. Ensure NOTION_API_KEY and NOTION_DATABASE_ID are set."
    );
  }

  return new NotionClient({ auth: env.data.NOTION_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    switch (parsed.action) {
      case "gmail.listMessages":
        return NextResponse.json(await handleListMessages(parsed.payload));
      case "gmail.sendMessage":
        return NextResponse.json(await handleSendMessage(parsed.payload));
      case "notion.listPages":
        return NextResponse.json(await handleListPages(parsed.payload));
      case "notion.createPage":
        return NextResponse.json(await handleCreatePage(parsed.payload));
      default:
        return NextResponse.json(
          { error: "Unsupported action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[agent] request error", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while handling request.",
      },
      { status: 500 }
    );
  }
}

async function handleListMessages(payload: unknown) {
  const schema = z
    .object({
      maxResults: z.number().int().positive().max(20).optional(),
      labelIds: z.array(z.string()).optional(),
      includeSpamTrash: z.boolean().optional(),
    })
    .optional();

  const params = schema.parse(payload) ?? {};
  const gmail = getGmailClient();

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: params.maxResults ?? 10,
    labelIds: params.labelIds,
    includeSpamTrash: params.includeSpamTrash,
  });

  const messages = response.data.messages ?? [];

  const detailedMessages = await Promise.all(
    messages.map(async (message) => {
      if (!message.id) return null;
      const result = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers =
        result.data.payload?.headers?.reduce<Record<string, string>>(
          (acc, header) => {
            if (header.name && header.value) {
              acc[header.name] = header.value;
            }
            return acc;
          },
          {}
        ) ?? {};

      return {
        id: message.id,
        threadId: message.threadId,
        snippet: result.data.snippet,
        headers,
      };
    })
  );

  return {
    messages: detailedMessages.filter(Boolean),
  };
}

async function handleSendMessage(payload: unknown) {
  const schema = z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
  });

  const params = schema.parse(payload);
  const gmail = getGmailClient();

  const rawMessage = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    params.body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return { status: "sent" };
}

async function handleListPages(payload: unknown) {
  const schema = z
    .object({
      pageSize: z.number().int().positive().max(20).optional(),
      filterProperty: z.string().optional(),
      filterValue: z.string().optional(),
    })
    .refine(
      (data) =>
        !data.filterProperty || (data.filterProperty && data.filterValue),
      {
        message: "filterValue must be provided when filterProperty is set.",
        path: ["filterValue"],
      }
    );

  const params = schema.parse(payload ?? {});
  const env = notionEnvSchema.parse(process.env);
  const notion = getNotionClient();

  const filter =
    params.filterProperty && params.filterValue
      ? {
          property: params.filterProperty,
          rich_text: {
            contains: params.filterValue,
          },
        }
      : undefined;

  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DATA_SOURCE_ID,
    page_size: params.pageSize ?? 10,
    filter,
  });

  return {
    pages: response.results
      .filter(isFullPageOrDataSource)
      .filter((item) => item.object === "page")
      .map((page) => ({
        id: page.id,
        url: page.url,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        properties: page.properties,
      })),
  };
}

async function handleCreatePage(payload: unknown) {
  const schema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
  });

  const params = schema.parse(payload);
  const env = notionEnvSchema.parse(process.env);
  const notion = getNotionClient();

  const response = await notion.pages.create({
    parent: {
      database_id: env.NOTION_DATABASE_ID,
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: params.title,
            },
          },
        ],
      },
    },
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: params.content,
              },
            },
          ],
        },
      },
    ],
  });

  const pageUrl = "url" in response ? response.url : null;

  return {
    pageId: response.id,
    url: pageUrl,
  };
}
