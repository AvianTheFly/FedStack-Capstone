import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  VerificationApiError,
  compareExtractedData,
  verifyBatch,
  verifyLabel
} from "../../api/verification";
import type {
  CanonicalLabelField,
  FieldResult,
  VerificationResult
} from "../../types/api";
import { FIELD_CONFIGS, fieldLabel, resultOrder } from "../labelFields";
import {
  ApplicationPackageRecord,
  PackageValidationError,
  buildReviewedResultsExport,
  emptyExtractedData,
  extractedDataFromResult,
  parseApplicationPackages,
  statusFromResult
} from "./packageWorkflowUtils";

function errorMessageFor(error: unknown): string {
  if (error instanceof VerificationApiError) {
    return error.message;
  }

  return "The verification service could not check these applications. Please try again.";
}

function displayFieldStatus(result: FieldResult): "Passed" | "Needs Review" {
  return result.status === "PASS" ? "Passed" : "Needs Review";
}

function sortedResults(result: VerificationResult | null): FieldResult[] {
  return result?.results.slice().sort((left, right) => resultOrder(left) - resultOrder(right)) ?? [];
}

function createPreviewUrl(file: File): string {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }

  return "";
}

function revokePreviewUrl(url: string) {
  if (url && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

export function PackageWorkflow() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordsRef = useRef<ApplicationPackageRecord[]>([]);
  const [records, setRecords] = useState<ApplicationPackageRecord[]>([]);
  const [validationErrors, setValidationErrors] = useState<PackageValidationError[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  const selectedRecord = records.find((record) => record.package_id === selectedPackageId) ?? null;
  const validRecords = useMemo(
    () => records.filter((record) => record.validation_errors.length === 0),
    [records]
  );
  const canCheck = validRecords.length > 0 && !isChecking;

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(
    () => () => {
      for (const record of recordsRef.current) {
        revokePreviewUrl(record.image_preview_url);
      }
    },
    []
  );

  async function importFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const parsed = await parseApplicationPackages(files);
    const nextRecords = parsed.records.map((record) => ({
      ...record,
      image_preview_url: createPreviewUrl(record.image_file)
    }));

    setRecords((current) => {
      for (const record of current) {
        revokePreviewUrl(record.image_preview_url);
      }
      return nextRecords;
    });
    setValidationErrors(parsed.errors);
    setSelectedPackageId(nextRecords[0]?.package_id ?? null);
    setCheckError(null);
    setRecheckError(null);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void importFiles(event.target.files);
      event.target.value = "";
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void importFiles(event.dataTransfer.files);
  }

  async function checkApplications() {
    if (validRecords.length === 0) {
      return;
    }

    setIsChecking(true);
    setCheckError(null);
    setRecheckError(null);

    try {
      if (validRecords.length === 1) {
        const record = validRecords[0];
        const result = await verifyLabel(record.image_file, record.application_data);
        updateRecordWithResult(record.package_id, result);
        return;
      }

      const batchResult = await verifyBatch(
        validRecords.map((record) => ({
          image: record.image_file,
          application_data: record.application_data
        }))
      );

      setRecords((current) =>
        current.map((record) => {
          const batchIndex = validRecords.findIndex(
            (validRecord) => validRecord.package_id === record.package_id
          );
          if (batchIndex < 0) {
            return record;
          }

          const item = batchResult.items.find((candidate) => candidate.index === batchIndex);
          if (!item) {
            return record;
          }

          if (item.result) {
            const extractedData = extractedDataFromResult(item.result);
            return {
              ...record,
              original_extracted_data: extractedData,
              reviewed_extracted_data: extractedData,
              comparison_result: item.result,
              status: statusFromResult(item.result),
              item_error: null
            };
          }

          return {
            ...record,
            comparison_result: null,
            status: "Needs Review",
            item_error: item.error?.message ?? "This application could not be checked."
          };
        })
      );
    } catch (error) {
      setCheckError(errorMessageFor(error));
    } finally {
      setIsChecking(false);
    }
  }

  function updateRecordWithResult(packageId: string, result: VerificationResult) {
    const extractedData = extractedDataFromResult(result);
    setRecords((current) =>
      current.map((record) =>
        record.package_id === packageId
          ? {
              ...record,
              original_extracted_data: record.original_extracted_data ?? extractedData,
              reviewed_extracted_data: extractedData,
              comparison_result: result,
              status: statusFromResult(result),
              item_error: null
            }
          : record
      )
    );
  }

  function openDetail(packageId: string) {
    setSelectedPackageId(packageId);
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  function updateExtractedField(field: CanonicalLabelField, value: string) {
    if (!selectedRecord) {
      return;
    }

    const currentExtracted = selectedRecord.reviewed_extracted_data ?? emptyExtractedData();
    setRecords((current) =>
      current.map((record) =>
        record.package_id === selectedRecord.package_id
          ? {
              ...record,
              reviewed_extracted_data: {
                ...currentExtracted,
                [field]: value
              }
            }
          : record
      )
    );
  }

  async function recheckExtractedText() {
    if (!selectedRecord) {
      return;
    }

    setIsRechecking(true);
    setRecheckError(null);

    try {
      const result = await compareExtractedData(
        selectedRecord.application_data,
        selectedRecord.reviewed_extracted_data ?? emptyExtractedData()
      );
      updateRecordWithResult(selectedRecord.package_id, result);
    } catch (error) {
      setRecheckError(errorMessageFor(error));
    } finally {
      setIsRechecking(false);
    }
  }

  function downloadReviewedResults() {
    const payload = buildReviewedResultsExport(records);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "reviewed-results.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="tool-layout package-workflow" aria-labelledby="package-title">
        <div className="page-heading">
          <p className="phase-label">Application Package Check</p>
          <h1 id="package-title">TTB Label Verification</h1>
        </div>

        <div
          aria-label="Application package upload"
          className={`package-dropzone ${isDragging ? "package-dropzone--active" : ""}`}
          data-testid="package-upload-area"
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div>
            <h2>Drop Application Packages</h2>
            <p>JSON and label image files</p>
          </div>
          <button
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Choose Files
          </button>
          <input
            accept=".json,application/json,image/jpeg,image/png,image/webp"
            className="file-input"
            multiple
            onChange={handleFileInputChange}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {validationErrors.length > 0 && (
          <section className="error-panel package-errors" aria-label="Validation errors">
            <strong>Some files need attention.</strong>
            <ul>
              {validationErrors.map((error, index) => (
                <li key={`${error.code}-${error.filename}-${index}`}>{error.message}</li>
              ))}
            </ul>
          </section>
        )}

        {checkError && (
          <div className="error-panel" role="alert">
            <strong>Could not check applications.</strong>
            <p>{checkError}</p>
          </div>
        )}

        <div className="package-actions">
          <button className="primary-button" disabled={!canCheck} onClick={checkApplications} type="button">
            {isChecking ? "Checking..." : "Check Applications"}
          </button>
          <button
            className="secondary-button"
            disabled={records.length === 0}
            onClick={downloadReviewedResults}
            type="button"
          >
            Download Reviewed Results JSON
          </button>
        </div>

        <section className="package-grid" aria-label="Uploaded applications">
          {records.length === 0 ? (
            <div className="empty-state">
              <h2>No Applications Loaded</h2>
              <p>Choose JSON and image files to begin.</p>
            </div>
          ) : (
            records.map((record) => (
              <article
                className={`package-card package-card--${record.status === "Passed" ? "passed" : record.status === "Needs Review" ? "review" : "pending"}`}
                key={record.package_id}
              >
                <button
                  className="package-card__button"
                  onClick={() => openDetail(record.package_id)}
                  type="button"
                >
                  {record.image_preview_url ? (
                    <img alt="" className="package-card__thumbnail" src={record.image_preview_url} />
                  ) : (
                    <span className="package-card__thumbnail package-card__thumbnail--blank" />
                  )}
                  <span className="package-card__body">
                    <strong>{record.package_id}</strong>
                    <span>{record.image_filename}</span>
                    <span className="status-chip">{record.status}</span>
                    {record.item_error && <span className="package-card__error">{record.item_error}</span>}
                  </span>
                </button>
              </article>
            ))
          )}
        </section>

        {selectedRecord && (
          <section className="detail-panel" aria-labelledby="detail-title">
            <div className="detail-panel__header">
              <div>
                <p className="result-label">{selectedRecord.package_id}</p>
                <h2 id="detail-title" ref={detailHeadingRef} tabIndex={-1}>
                  {selectedRecord.image_filename}
                </h2>
              </div>
              <span className="status-chip status-chip--large">{selectedRecord.status}</span>
            </div>

            <div className="detail-layout">
              <div className="detail-image-frame">
                {selectedRecord.image_preview_url && (
                  <img
                    alt={`Label image for ${selectedRecord.image_filename}`}
                    src={selectedRecord.image_preview_url}
                  />
                )}
              </div>

              <div className="detail-fields">
                <FieldSet
                  data={selectedRecord.application_data}
                  legend="Application Values"
                  mode="readonly"
                  prefix="application"
                />
                <FieldSet
                  data={selectedRecord.reviewed_extracted_data ?? emptyExtractedData()}
                  legend="Extracted Values"
                  mode="editable"
                  onChange={updateExtractedField}
                  prefix="extracted"
                />
              </div>
            </div>

            {recheckError && (
              <div className="error-panel" role="alert">
                <strong>Could not recheck extracted text.</strong>
                <p>{recheckError}</p>
              </div>
            )}

            <button
              className="primary-button"
              disabled={isRechecking}
              onClick={recheckExtractedText}
              type="button"
            >
              {isRechecking ? "Rechecking..." : "Recheck Extracted Text"}
            </button>

            <section className="comparison-results" aria-label="Backend comparison results">
              <h3>Backend Results</h3>
              {selectedRecord.comparison_result ? (
                sortedResults(selectedRecord.comparison_result).map((fieldResult) => (
                  <article
                    className={`comparison-row comparison-row--${fieldResult.status.toLowerCase()}`}
                    key={fieldResult.field}
                  >
                    <div className="comparison-row__heading">
                      <h4>{fieldLabel(fieldResult.field)}</h4>
                      <span className="status-badge">{displayFieldStatus(fieldResult)}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Application value</dt>
                        <dd>{fieldResult.expected || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Extracted value</dt>
                        <dd>{fieldResult.found || "Not found"}</dd>
                      </div>
                      <div>
                        <dt>Reason</dt>
                        <dd>{fieldResult.message}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <p className="empty-comparison">Pending Check</p>
              )}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}

interface FieldSetProps {
  data: Record<CanonicalLabelField, string | null>;
  legend: string;
  mode: "readonly" | "editable";
  onChange?: (field: CanonicalLabelField, value: string) => void;
  prefix: string;
}

function FieldSet({ data, legend, mode, onChange, prefix }: FieldSetProps) {
  return (
    <fieldset className="package-fieldset">
      <legend>{legend}</legend>
      <div className="field-grid">
        {FIELD_CONFIGS.map((field) => {
          const id = `${prefix}-${field.name}`;
          const value = data[field.name] ?? "";
          const commonProps = {
            id,
            name: field.name,
            value
          };

          return (
            <div
              className={`form-field ${field.multiline ? "form-field--wide" : ""}`}
              key={field.name}
            >
              <label htmlFor={id}>{field.label}</label>
              {field.multiline ? (
                <textarea
                  {...commonProps}
                  aria-label={`${legend} ${field.label}`}
                  onChange={(event) => onChange?.(field.name, event.target.value)}
                  readOnly={mode === "readonly"}
                  rows={4}
                />
              ) : (
                <input
                  {...commonProps}
                  aria-label={`${legend} ${field.label}`}
                  onChange={(event) => onChange?.(field.name, event.target.value)}
                  readOnly={mode === "readonly"}
                  type="text"
                />
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
