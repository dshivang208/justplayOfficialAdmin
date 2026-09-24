import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lock, Mail, Phone, ShieldCheck } from "lucide-react";
import { useAdminAuth, DEMO_OTP } from "@/lib/admin-auth";
import { Button } from "@/components/admin/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-medium text-destructive">{message}</p>;
}

function PasswordLoginForm() {
  const { loginWithPassword } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(email, password);
      void navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Work email</Label>
        <div className="relative mt-1.5">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@justplay.in"
            className="pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="pl-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>
      <FieldError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function OtpLoginForm() {
  const { requestOtp, verifyOtp } = useAdminAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestOtp(phone);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(phone, code);
      void navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <div>
          <Label htmlFor="otp">6-digit code</Label>
          <p className="mb-1.5 mt-0.5 text-xs text-muted-foreground">Sent to {phone}</p>
          <Input
            id="otp"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>
        <FieldError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Verifying…" : "Verify & sign in"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setCode("");
            setError(null);
          }}
          className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Use a different number
        </button>
        <p className="text-center text-xs text-muted-foreground">Demo code: {DEMO_OTP}</p>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequestOtp} className="space-y-4">
      <div>
        <Label htmlFor="phone">Registered phone number</Label>
        <div className="relative mt-1.5">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            className="pl-9"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
      </div>
      <FieldError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Sending code…" : "Send OTP"}
      </Button>
    </form>
  );
}

export function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-10 text-background lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div
          className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            JP
          </div>
          <span className="font-display text-lg font-semibold">JustPlay</span>
        </div>
        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full bg-background/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-background/80">
            <ShieldCheck className="h-3.5 w-3.5" />
            Internal use only
          </span>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight">
            Operations console for the JustPlay platform.
          </h1>
          <p className="mt-3 text-sm text-background/70">
            Manage venues, bookings, users, payouts and content across the Kanpur
            launch — from one place.
          </p>
        </div>
        <p className="relative text-xs text-background/50">
          Access restricted to JustPlay team members with a provisioned account.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                JP
              </div>
              <span className="font-display text-lg font-semibold text-foreground">
                JustPlay Admin
              </span>
            </div>
          </div>

          <h2 className="font-display text-2xl font-semibold text-foreground">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin accounts are provisioned by IT — there's no self-signup here.
          </p>

          <Tabs defaultValue="password" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Email &amp; password</TabsTrigger>
              <TabsTrigger value="otp">Phone OTP</TabsTrigger>
            </TabsList>
            <TabsContent value="password" className="mt-6">
              <PasswordLoginForm />
            </TabsContent>
            <TabsContent value="otp" className="mt-6">
              <OtpLoginForm />
            </TabsContent>
          </Tabs>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Trouble signing in?{" "}
            <a href="mailto:it@justplay.in" className="font-medium text-primary hover:underline">
              Contact IT
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
