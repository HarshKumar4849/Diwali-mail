"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/types";

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
    <div className="max-w-3xl mx-auto p-6">
      <p className="text-xs text-muted-foreground mb-2 text-center">Progress is saved in this browser tab</p>
      <div className="flex mb-8">
        {steps.map((s, i) => (
          <div key={i} className={`flex-1 text-center pb-2 border-b-2 ${i <= currentStep ? "border-primary text-primary" : "border-muted text-muted-foreground"}`}>
            {s.title}
          </div>
        ))}
      </div>
      <div className="mb-6">
        {CurrentStep.render({ data, updateData })}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={prev} disabled={currentStep === 0 || loading}>Back</Button>
        <Button onClick={next} disabled={loading}>
          {loading ? "Saving & Sending..." : currentStep < steps.length - 1 ? "Next" : "Review & Send"}
        </Button>
      </div>
    </div>
  );
}
