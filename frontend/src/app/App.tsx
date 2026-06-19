import { useState } from "react";

import { BatchVerification } from "../features/batch/BatchVerification";
import { SingleLabelVerification } from "../features/single-label/SingleLabelVerification";

type ViewMode = "single" | "batch";

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("single");

  return (
    <>
      <nav className="mode-switch" aria-label="Verification mode">
        <button
          aria-pressed={viewMode === "single"}
          className={viewMode === "single" ? "mode-switch__button is-active" : "mode-switch__button"}
          onClick={() => setViewMode("single")}
          type="button"
        >
          Single Label
        </button>
        <button
          aria-pressed={viewMode === "batch"}
          className={viewMode === "batch" ? "mode-switch__button is-active" : "mode-switch__button"}
          onClick={() => setViewMode("batch")}
          type="button"
        >
          Batch Upload
        </button>
      </nav>
      {viewMode === "single" ? <SingleLabelVerification /> : <BatchVerification />}
    </>
  );
}
