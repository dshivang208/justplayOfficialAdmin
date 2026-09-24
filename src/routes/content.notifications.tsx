import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/admin/Button";
import { ContentSectionTabs } from "@/components/admin/ContentSectionTabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSentNotifications,
  getAudienceCount,
  sendNotification,
  audienceLabels,
  type NotificationAudience,
  type SentNotification,
} from "@/lib/admin-data/notifications";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function NotificationsPage() {
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<NotificationAudience>("all_users");
  const [sendInApp, setSendInApp] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [sendPush, setSendPush] = useState(false);
  const [reach, setReach] = useState<number | null>(null);
  const [sent, setSent] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    listSentNotifications()
      .then(setSent)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load notification history."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getAudienceCount(audience)
      .then(setReach)
      .catch(() => setReach(null));
  }, [audience]);

  async function handleSend() {
    setSending(true);
    try {
      const result = await sendNotification(message.trim(), audience, {
        inApp: sendInApp,
        sms: sendSms,
        push: sendPush,
      });
      setSent((prev) => [result, ...prev]);
      setMessage("");

      const parts: string[] = [];
      if (sendInApp) {
        parts.push(
          result.inAppDelivered > 0 ? `${result.inAppDelivered} in-app` : "0 in-app (no matching users)",
        );
      }
      if (sendSms) {
        parts.push(
          result.smsSent > 0 || result.smsFailed > 0
            ? `${result.smsSent} SMS sent${result.smsFailed > 0 ? `, ${result.smsFailed} failed` : ""}`
            : "0 SMS (no matching users)",
        );
      }
      if (sendPush) {
        parts.push(
          result.pushSent > 0 || result.pushFailed > 0
            ? `${result.pushSent} push sent${result.pushFailed > 0 ? `, ${result.pushFailed} failed` : ""}`
            : "0 push (no matching users, or none opted in on their device)",
        );
      }
      toast.success(parts.length > 0 ? `Delivered: ${parts.join(" \u00b7 ")}` : "Nothing was sent \u2014 select a channel first");

      if (result.smsErrors.length > 0) toast.error(result.smsErrors[0]);
      if (result.pushErrors.length > 0) toast.error(result.pushErrors[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send this notification.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Content, Discovery &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Send a real notification to users</p>
        </div>

        <ContentSectionTabs />

        <div className="surface-card mt-5 rounded-xl p-5">
          <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            In-app delivers to a real per-user inbox the consumer app reads. SMS sends for real via
            Twilio, and Push sends real browser/OS push notifications via Web Push \u2014 both only
            to users who've opted in on their device for push.
          </p>
          <Label htmlFor="ntf-message">Message</Label>
          <Textarea
            id="ntf-message"
            className="mt-1.5"
            rows={4}
            placeholder="What do you want to tell them?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <div className="mt-4">
            <Label>Target audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as NotificationAudience)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(audienceLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Estimated reach: {reach === null ? "\u2014" : reach.toLocaleString("en-IN")} users
            </p>
          </div>

          <div className="mt-4">
            <Label>Channels</Label>
            <div className="mt-1.5 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={sendInApp} onCheckedChange={(v) => setSendInApp(v === true)} />
                In-app notification
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={sendSms} onCheckedChange={(v) => setSendSms(v === true)} />
                SMS (real send via Twilio \u2014 costs money per message, sent to every matching user)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={sendPush} onCheckedChange={(v) => setSendPush(v === true)} />
                Push notification (real Web Push \u2014 only reaches users who've enabled it on their device)
              </label>
            </div>
          </div>

          <Button
            className="mt-5"
            disabled={message.trim().length === 0 || (!sendInApp && !sendSms && !sendPush) || sending}
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending\u2026" : "Send notification"}
          </Button>
        </div>

        {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

        <div className="mt-8">
          <h2 className="mb-3 font-display text-base font-semibold text-foreground">
            Recently sent
          </h2>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="surface-card divide-y divide-border overflow-hidden rounded-xl">
              {sent.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <p className="text-sm text-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {audienceLabels[n.audience]} \u00b7 {n.recipientCount.toLocaleString("en-IN")} recipients
                    \u00b7 {formatDate(n.sentDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}