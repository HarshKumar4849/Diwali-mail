"use client";

import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface WizardStep {
  title: string;
  component: ReactNode;
}

const STORAGE_KEY = "mailcraft-wizard-data";

function loadSavedData(): any {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function Wizard({ steps, onComplete }: { steps: WizardStep[]; onComplete: (data: any) => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<any>(loadSavedData);

  const updateData = (partial: any) => {
    setData((prev: any) => {
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
        {React.cloneElement(steps[currentStep].component as React.ReactElement, { data, updateData })}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={prev} disabled={currentStep === 0}>Back</Button>
        <Button onClick={next}>{currentStep < steps.length - 1 ? "Next" : "Review & Send"}</Button>
      </div>
    </div>
  );
}
