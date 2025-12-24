"use client";

import { FormEvent, useCallback, useState } from "react";
import styles from "./page.module.css";

type AgentAction =
  | "gmail.listMessages"
  | "gmail.sendMessage"
  | "notion.listPages"
  | "notion.createPage";

type AgentResponse =
  | {
      messages: Array<{
        id: string;
        threadId?: string | null;
        snippet?: string | null;
        headers: Record<string, string>;
      }>;
    }
  | {
      status: string;
    }
  | {
      pages: Array<{
        id: string;
        url: string;
        createdTime: string;
        lastEditedTime: string;
        properties: Record<string, unknown>;
      }>;
    }
  | {
      pageId: string;
      url: string | null;
    };

type AgentError = {
  error: string;
};

const DEFAULT_PAYLOADS: Record<
  AgentAction,
  Record<string, string | number | boolean>
> = {
  "gmail.listMessages": { maxResults: 5, labelIds: "", includeSpamTrash: false },
  "gmail.sendMessage": {
    to: "",
    subject: "Hello from the agent",
    body: "Hi there,\n\nThis message was sent from your agent.\n",
  },
  "notion.listPages": { pageSize: 5, filterProperty: "", filterValue: "" },
  "notion.createPage": {
    title: "Agent generated entry",
    content: "This content was created by the Gmail + Notion agent.",
  },
};

export default function Home() {
  const [activeAction, setActiveAction] =
    useState<AgentAction>("gmail.listMessages");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AgentResponse | AgentError | null>(null);
  const [formState, setFormState] = useState<
    Record<string, string | number | boolean>
  >(() => ({ ...DEFAULT_PAYLOADS["gmail.listMessages"] }));

  const handleActionChange = useCallback(
    (action: AgentAction) => {
      setResult(null);
      setActiveAction(action);
      setFormState({ ...DEFAULT_PAYLOADS[action] });
    },
    []
  );

  const handleChange = useCallback((key: string, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsLoading(true);
      setResult(null);
      try {
        const payload = Object.entries(formState).reduce<Record<string, unknown>>(
          (acc, [key, value]) => {
            if (typeof value === "boolean" || typeof value === "number") {
              acc[key] = value;
              return acc;
            }

            const trimmed = value.toString().trim();
            if (trimmed.length === 0) {
              return acc;
            }

            if (trimmed === "true") {
              acc[key] = true;
              return acc;
            }

            if (trimmed === "false") {
              acc[key] = false;
              return acc;
            }

            if (key === "labelIds") {
              const labels = trimmed
                .split(",")
                .map((label) => label.trim())
                .filter(Boolean);
              if (labels.length > 0) {
                acc[key] = labels;
              }
              return acc;
            }

            const numericValue = Number(trimmed);
            if (!Number.isNaN(numericValue) && trimmed === numericValue.toString()) {
              acc[key] = numericValue;
              return acc;
            }

            acc[key] = trimmed;
            return acc;
          },
          {}
        );

        const response = await fetch("/api/agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: activeAction,
            payload,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          setResult({ error: data.error ?? "Unknown error" });
        } else {
          setResult(data);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed";
        setResult({ error: message });
      } finally {
        setIsLoading(false);
      }
    },
    [activeAction, formState]
  );

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Gmail ↔ Notion Agent</h1>
        <p className={styles.subtitle}>
          Execute Gmail and Notion workflows from a single control panel.
          Configure environment variables to connect your accounts.
        </p>
      </header>

      <section className={styles.panel}>
        <div className={styles.actions}>
          <h2 className={styles.sectionTitle}>Choose an action</h2>
          <div className={styles.actionsGrid}>
            <ActionButton
              label="List Gmail Messages"
              description="Fetch recent messages with subjects and senders."
              action="gmail.listMessages"
              activeAction={activeAction}
              onSelect={handleActionChange}
            />
            <ActionButton
              label="Send Gmail Message"
              description="Compose and send an email from your account."
              action="gmail.sendMessage"
              activeAction={activeAction}
              onSelect={handleActionChange}
            />
            <ActionButton
              label="List Notion Pages"
              description="Query the configured Notion database."
              action="notion.listPages"
              activeAction={activeAction}
              onSelect={handleActionChange}
            />
            <ActionButton
              label="Create Notion Page"
              description="Add a new entry to the database."
              action="notion.createPage"
              activeAction={activeAction}
              onSelect={handleActionChange}
            />
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <h2 className={styles.sectionTitle}>Parameters</h2>
          <div className={styles.formGrid}>
            {Object.entries(formState).map(([key, value]) => (
              <label key={key} className={styles.field}>
                <span className={styles.fieldLabel}>{key}</span>
                <input
                  className={styles.input}
                  value={String(value ?? "")}
                  onChange={(event) => handleChange(key, event.target.value)}
                  placeholder={key}
                />
              </label>
            ))}
            {Object.keys(formState).length === 0 && (
              <p className={styles.emptyState}>No parameters required for this action.</p>
            )}
          </div>
          <button className={styles.submit} type="submit" disabled={isLoading}>
            {isLoading ? "Running..." : "Run Agent"}
          </button>
        </form>
      </section>

      <section className={styles.resultSection}>
        <h2 className={styles.sectionTitle}>Result</h2>
        <div className={styles.resultBox}>
          {result ? (
            "error" in result ? (
              <pre className={styles.error}>{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <pre className={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
            )
          ) : (
            <p className={styles.emptyState}>Run an action to see the output.</p>
          )}
        </div>
      </section>
    </main>
  );
}

type ActionButtonProps = {
  label: string;
  description: string;
  action: AgentAction;
  activeAction: AgentAction;
  onSelect: (action: AgentAction) => void;
};

function ActionButton({ label, description, action, activeAction, onSelect }: ActionButtonProps) {
  const isActive = activeAction === action;
  return (
    <button
      type="button"
      onClick={() => onSelect(action)}
      className={`${styles.actionButton} ${isActive ? styles.actionButtonActive : ""}`}
    >
      <span className={styles.actionLabel}>{label}</span>
      <span className={styles.actionDescription}>{description}</span>
    </button>
  );
}
