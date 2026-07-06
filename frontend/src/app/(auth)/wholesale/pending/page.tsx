import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Application Under Review — AF Apparels Wholesale",
};

export default function WholesalePendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">Application Under Review</h1>

        <p className="text-gray-600 mb-4">
          Thank you for applying for a wholesale account with AF Apparels. Your application is
          currently under review.
        </p>

        <p className="text-gray-600 mb-8">
          You will receive an email notification once your application has been processed.
          This typically takes 1–2 business days.
        </p>

        <div className="bg-gray-100 rounded-lg p-4 mb-8 text-sm text-gray-700">
          <p className="font-medium mb-1">Questions?</p>
          <p>
            Contact us at{" "}
            <a href="mailto:info@afblanks.com" className="text-brand-600 hover:text-brand-700">
              info@afblanks.com
            </a>
          </p>
        </div>

        <Link
          href="/login"
          className="inline-block text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
