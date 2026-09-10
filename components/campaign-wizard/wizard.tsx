"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/types";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/error-boundary";
import { Check, ArrowLeft, ArrowRight, Save } from "lucide-react";

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
  } catch {
    return {};
  }
}

export function Wizard({
  steps,
  onComplete,
  loading,
}: {
  steps: WizardStep[];
  onComplete: (data: WizardData) => void;
  loading?: boolean;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(loadSavedData as unknown as WizardData);

  const updateData = (partial: Partial<WizardData>) => {
    setData((prev: WizardData) => {
      const next = { ...prev, ...partial };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
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
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 pb-28 md:pb-12">
      {/* Stepper Header */}
      <div className="mb-8">
        {/* Desktop Stepper */}
        <nav aria-label="Progress" className="hidden sm:block">
          <ol className="flex items-center justify-between">
            {steps.map((step, i) => {
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;

              return (
                <li key={step.title} className="relative flex-1 flex items-center">
                  <div className="flex flex-col items-center gap-2 group flex-1">
                    <div
                      className={cn(
                        "size-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 shadow-2xs",
                        isCompleted
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : isCurrent
                          ? "bg-primary/10 text-primary border-2 border-primary ring-4 ring-primary/15"
                          : "bg-muted/70 text-muted-foreground border border-border/60"
                      )}
                    >
                      {isCompleted ? <Check className="size-4 stroke-[2.5]" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs text-center transition-colors font-medium whitespace-nowrap",
                        isCurrent
                          ? "text-foreground font-semibold"
                          : isCompleted
                          ? "text-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {step.title}
                    </span>
                  </div>

                  {/* Connector Line */}
                  {i < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-full flex-1 -translate-y-3 transition-colors duration-300",
                        i < currentStep ? "bg-primary" : "bg-border/60"
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Mobile Compact Stepper */}
        <div className="sm:hidden flex items-center justify-between bg-card border border-border/70 rounded-xl p-3.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="size-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-xs">
              {currentStep + 1}
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Step {currentStep + 1} of {steps.length}</p>
              <p className="text-sm font-semibold text-foreground">{steps[currentStep].title}</p>
            </div>
          </div>
          <div className="flex gap-1.5 items-center">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === currentStep ? "w-5 bg-primary" : i < currentStep ? "w-2.5 bg-primary/60" : "w-1.5 bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Step Content Card */}
      <div className="bg-card rounded-2xl border border-border/80 p-5 sm:p-6 md:p-8 shadow-xs mb-8 transition-all">
        <div className="mb-6 pb-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">{CurrentStep.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {currentStep + 1} of {steps.length} — configuration is saved in this tab
            </p>
          </div>
        </div>

        <ErrorBoundary
          key={currentStep}
          fallback={
            <div className="py-12 text-center text-muted-foreground">
              <p className="font-medium text-foreground">Something went wrong rendering this step.</p>
              <button className="underline text-primary text-sm mt-2" onClick={prev}>
                Go back
              </button>{" "}
              and try again.
            </div>
          }
        >
          <div className="animate-in fade-in-50 duration-200 ease-out">
            {CurrentStep.render({ data, updateData })}
          </div>
        </ErrorBoundary>
      </div>

      {/* Bottom Sticky Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/70 p-4 md:static md:border-0 md:p-0 md:bg-transparent z-30">
        <div className="flex items-center justify-between max-w-4xl mx-auto gap-4">
          <Button
            variant="outline"
            onClick={prev}
            disabled={currentStep === 0 || loading}
            className="gap-2 h-10 px-4"
          >
            <ArrowLeft className="size-4" />
            <span>Back</span>
          </Button>

          <Button
            onClick={next}
            disabled={loading}
            className="gap-2 h-10 px-6 shadow-xs"
          >
            {loading ? (
              <span>Saving...</span>
            ) : currentStep < steps.length - 1 ? (
              <>
                <span>Next Step</span>
                <ArrowRight className="size-4" />
              </>
            ) : (
              <>
                <Save className="size-4" />
                <span>Save Campaign</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
