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
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 pb-12">
      {/* Stepper Header — Clickable Tabs */}
      <div className="mb-8">
        {/* Desktop Stepper — Interactive Clickable Tabs */}
        <nav aria-label="Progress" className="hidden sm:block">
          <ol className="flex items-center justify-between">
            {steps.map((step, i) => {
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;

              return (
                <li key={step.title} className="relative flex-1 flex items-center">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(i)}
                    className="flex flex-col items-center gap-2 group flex-1 cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-1"
                    title={`Click to jump to Step ${i + 1}: ${step.title}`}
                  >
                    <div
                      className={cn(
                        "size-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 shadow-2xs group-hover:scale-105",
                        isCompleted
                          ? "bg-primary text-primary-foreground shadow-xs group-hover:bg-primary/90"
                          : isCurrent
                          ? "bg-primary/10 text-primary border-2 border-primary ring-4 ring-primary/15"
                          : "bg-muted/70 text-muted-foreground border border-border/60 group-hover:border-primary/50 group-hover:text-foreground"
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
                          ? "text-foreground/80 group-hover:text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {step.title}
                    </span>
                  </button>

                  {/* Connector Line */}
                  {i < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-full flex-1 -translate-y-3 transition-colors duration-300 pointer-events-none",
                        i < currentStep ? "bg-primary" : "bg-border/60"
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Mobile Compact Stepper — Interactive */}
        <div className="sm:hidden bg-card border border-border/70 rounded-xl p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="size-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-xs">
                {currentStep + 1}
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Step {currentStep + 1} of {steps.length}</p>
                <p className="text-sm font-semibold text-foreground">{steps[currentStep].title}</p>
              </div>
            </div>

            {/* Quick Next/Back for Mobile */}
            <div className="flex items-center gap-1.5">
              {currentStep > 0 && (
                <Button variant="outline" size="xs" onClick={prev} disabled={loading} className="h-7 px-2.5 text-xs">
                  <ArrowLeft className="size-3" />
                </Button>
              )}
              <Button size="xs" onClick={next} disabled={loading} className="h-7 px-3 text-xs">
                {currentStep < steps.length - 1 ? (
                  <>
                    <span>Next</span>
                    <ArrowRight className="size-3 ml-1" />
                  </>
                ) : (
                  <span>Save</span>
                )}
              </Button>
            </div>
          </div>

          {/* Clickable Step Pills */}
          <div className="flex gap-1.5 items-center justify-between pt-1">
            {steps.map((step, i) => (
              <button
                key={step.title}
                type="button"
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "h-2 rounded-full flex-1 transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  i === currentStep
                    ? "bg-primary ring-2 ring-primary/20"
                    : i < currentStep
                    ? "bg-primary/60 hover:bg-primary/80"
                    : "bg-muted hover:bg-muted-foreground/30"
                )}
                title={`Jump to ${step.title}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Step Content Card */}
      <div className="bg-card rounded-2xl border border-border/80 p-5 sm:p-6 md:p-8 shadow-xs transition-all">
        {/* Card Header with Step Title and Quick Action Buttons */}
        <div className="mb-6 pb-4 border-b border-border/60 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">{CurrentStep.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {currentStep + 1} of {steps.length} — click any step above to jump directly
            </p>
          </div>

          {/* Quick Navigation in Card Header */}
          <div className="flex items-center gap-2 shrink-0">
            {currentStep > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={prev}
                disabled={loading}
                className="gap-1.5 h-8 px-3 text-xs cursor-pointer"
              >
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={next}
              disabled={loading}
              className="gap-1.5 h-8 px-3.5 text-xs shadow-xs cursor-pointer"
            >
              {loading ? (
                <span>Saving...</span>
              ) : currentStep < steps.length - 1 ? (
                <>
                  <span>Next Step</span>
                  <ArrowRight className="size-3.5" />
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  <span>Save Campaign</span>
                </>
              )}
            </Button>
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

        {/* In-Card Bottom Action Buttons */}
        <div className="mt-8 pt-6 border-t border-border/60 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={prev}
            disabled={currentStep === 0 || loading}
            className="gap-2 h-10 px-4 cursor-pointer"
          >
            <ArrowLeft className="size-4" />
            <span>Back</span>
          </Button>

          <div className="text-xs text-muted-foreground hidden sm:block">
            Step {currentStep + 1} of {steps.length}: <span className="font-medium text-foreground">{CurrentStep.title}</span>
          </div>

          <Button
            onClick={next}
            disabled={loading}
            className="gap-2 h-10 px-6 shadow-xs cursor-pointer"
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
