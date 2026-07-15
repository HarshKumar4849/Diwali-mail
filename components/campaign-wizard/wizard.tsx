"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/types";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/error-boundary";

interface WizardStep {
  title: string;
  render: (props: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) => React.ReactNode;
}

const STORAGE_KEY = "mailcraft-wizard-data";

function loadSavedData(): Partial<WizardData> {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function Wizard({ steps, onComplete, loading }: { steps: WizardStep[]; onComplete: (data: WizardData) => void; loading?: boolean }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(loadSavedData as unknown as WizardData);

  const updateData = (partial: Partial<WizardData>) => {
    setData((prev: WizardData) => {
      const next = { ...prev, ...partial };
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const next = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
    else onComplete(data);
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const CurrentStep = steps[currentStep];

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-6">
      <p className="text-xs text-muted-foreground mb-3 text-center">Progress saved in this tab</p>

      {/* Compact step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              "size-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
              i <= currentStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              {i + 1}
            </div>
            <span className={cn(
              "text-xs hidden md:inline transition-colors",
              i === currentStep ? "text-foreground font-medium" : "text-muted-foreground"
            )}>
              {s.title}
            </span>
            {i < steps.length - 1 && (
              <div className={cn(
                "h-px w-4 md:w-8",
                i < currentStep ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="mb-6">
        <ErrorBoundary key={currentStep} fallback={
          <div className="p-8 text-center text-muted-foreground">
            Something went wrong rendering this step.{" "}
            <button className="underline text-primary" onClick={prev}>Go back</button> and try again.
          </div>
        }>
          {CurrentStep.render({ data, updateData })}
        </ErrorBoundary>
      </div>

      {/* Bottom-fixed nav buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 md:static md:border-0 md:p-0 md:bg-transparent md:flex md:justify-between md:gap-4">
        <div className="flex gap-3 max-w-3xl mx-auto md:mx-0 md:w-full md:flex md:justify-between">
          <Button
            variant="outline"
            onClick={prev}
            disabled={currentStep === 0 || loading}
            className="flex-1 md:flex-initial"
          >
            Back
          </Button>
          <Button
            onClick={next}
            disabled={loading}
            className="flex-1 md:flex-initial"
          >
            {loading ? "Saving..." : currentStep < steps.length - 1 ? "Next" : "Save Campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
