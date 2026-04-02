import React, { useState } from "react";
import "../styles/onboarding.css";

const STEPS = [
  {
    icon: "📷",
    title: "Position Your Camera",
    tip: "Place your device 6-8 feet away at chest height. Make sure the camera can see your full body with good lighting.",
  },
  {
    icon: "🧍",
    title: "Stand in Frame",
    tip: "Stand so your full body is visible. The AI will detect your skeleton and overlay it on screen. Green skeleton = tracking is active.",
  },
  {
    icon: "💪",
    title: "Pick an Exercise & Go!",
    tip: "Select an exercise from the dropdown, press START, and begin your reps. The AI counts reps and scores your form in real-time.",
  },
];

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem("ai_trainer_onboarded", "true");
      onComplete();
    }
  };

  const handleSkip = () => {
    localStorage.setItem("ai_trainer_onboarded", "true");
    onComplete();
  };

  const s = STEPS[step];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-icon">{s.icon}</div>
        <h2>{s.title}</h2>

        <div className="onboarding-steps">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`onboarding-step ${i === step ? "onboarding-step--active" : ""}`}
            />
          ))}
        </div>

        <div className="onboarding-tip">{s.tip}</div>

        <button className="btn--onboarding" onClick={handleNext}>
          {step < STEPS.length - 1 ? "Next" : "Get Started"}
        </button>

        <div>
          <button className="btn--skip" onClick={handleSkip}>
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
