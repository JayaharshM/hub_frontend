"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email) {
      setError("Email is required");
      return;
    }
    if (otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP code");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/verify-otp", {
        email,
        otp,
      });
      setMessage("Verification successful! You can now sign in.");
      setTimeout(() => {
        router.push("/auth/login");
      }, 2000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        "Verification failed. Please check the code and try again.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setMessage(null);

    if (!email) {
      setError("Email is required to resend OTP");
      return;
    }

    setIsResending(true);
    try {
      await api.post("/auth/resend-otp", {
        email,
      });
      setMessage("A new verification code has been sent to your email.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        "Failed to resend code. Please try again.";
      setError(msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="card-cixio p-8 shadow-xl">
      <h1 className="text-2xl font-bold mb-1 text-cixio-dark">Verify your email</h1>
      <p className="text-sm text-gray-500 mb-6">Enter the 6-digit OTP code sent to your inbox</p>

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-1.5 text-gray-700">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@tkmce.ac.in"
            className="input-cixio"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1.5 text-gray-700">Verification Code</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="input-cixio text-center tracking-widest text-lg font-bold"
            maxLength={6}
            required
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-green-600 text-sm">{message}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-cixio w-full mt-2"
        >
          {isSubmitting ? "Verifying..." : "Verify Code"}
        </button>
      </form>

      <div className="flex flex-col gap-3 mt-6">
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending}
          className="text-sm text-cixio-blue font-medium hover:text-cixio-navy transition-colors text-center disabled:opacity-50"
        >
          {isResending ? "Resending..." : "Resend verification code"}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already verified?{" "}
          <Link href="/auth/login" className="text-cixio-blue font-medium hover:text-cixio-navy transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <div className="min-h-screen flex bg-cixio-dark">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col items-center justify-center w-1/2 bg-gradient-to-br from-cixio-navy via-cixio-dark to-[#060F3A] p-12 relative overflow-hidden">
        <div className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full bg-cixio-blue/20 blur-3xl" />
        <div className="absolute bottom-[-60px] right-[-60px] w-64 h-64 rounded-full bg-cixio-blue/15 blur-3xl" />
        <img src="/cixio-logo-white.png" alt="Cixio" className="w-56 mb-10 relative z-10" />
        <h2 className="text-white text-3xl font-bold text-center mb-4 relative z-10 leading-tight">
          Verify your account
        </h2>
        <p className="text-cixio-light/60 text-center text-sm max-w-xs relative z-10 leading-relaxed">
          Ensure security by verifying your institutional email.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 bg-cixio-bg py-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8 lg:hidden">
            <img src="/cixio-logo.png" alt="Cixio" className="h-10 w-auto" />
          </div>

          <Suspense fallback={<div className="text-center text-gray-500 font-medium">Loading verification panel...</div>}>
            <VerifyOtpContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
