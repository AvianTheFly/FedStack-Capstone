import type {
  ApplicationData,
  CanonicalLabelField,
  ExtractedData,
  FieldReviewDecision,
  VerificationResult
} from "../../types/api";
import { ACCEPTED_IMAGE_TYPES, FIELD_CONFIGS } from "../labelFields";

export type VisibleStatus = "Pending Check" | "Passed" | "Needs Review" | "Fail";
export interface PackageValidationError {
  code:
    | "invalid_json"
    | "missing_image_filename"
    | "missing_application_data"
    | "missing_canonical_fields"
    | "extra_non_canonical_fields"
    | "duplicate_image_filename"
    | "json_with_no_matching_image"
    | "image_with_no_matching_json"
    | "unsupported_image_type";
  message: string;
  filename: string;
}

export interface ApplicationPackageRecord {
  package_id: string;
  json_filename: string;
  image_filename: string;
  image_file: File;
  image_preview_url: string;
  application_data: ApplicationData;
  original_extracted_data: ExtractedData | null;
  reviewed_extracted_data: ExtractedData | null;
  comparison_result: VerificationResult | null;
  field_decisions: Partial<Record<CanonicalLabelField, FieldReviewDecision>>;
  status: VisibleStatus;
  validation_errors: PackageValidationError[];
  item_error: string | null;
}

export interface IncompleteApplicationRecord {
  incomplete_id: string;
  kind: "json_missing_image" | "image_missing_json";
  json_filename: string | null;
  image_filename: string | null;
  expected_image_filename: string | null;
  application_data: ApplicationData | null;
  image_file: File | null;
  image_preview_url: string;
  message: string;
}

export interface SubmissionResultsExport {
  schema_version: "pretend-submission-results-v1";
  generated_at: string;
  applications: SubmissionResultApplication[];
}

export interface SubmissionResultApplication {
  application_id: string;
  application_filename: string | null;
  image_filename: string | null;
  status: "pass" | "fail";
  reason: string;
}

export interface ReviewedResultsExport {
  schema_version: "application-package-review-v1";
  generated_at: string;
  summary: {
    failed: number;
    passed: number;
    needs_review: number;
    pending: number;
    total: number;
  };
  applications: ReviewedResultsApplication[];
}

export interface ReviewedResultsApplication {
  application_id: string;
  json_filename: string;
  image_filename: string;
  status: VisibleStatus;
  application_data: ApplicationData;
  reviewed_extracted_data: ExtractedData | null;
  field_results: VerificationResult["results"];
  overall_verdict: VerificationResult["overall_verdict"] | null;
  errors: { code: string; message: string }[];
}

interface JsonCandidate {
  file: File;
  parsed: unknown | null;
  image_filename: string | null;
  application_data: ApplicationData | null;
  errors: PackageValidationError[];
}

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp)$/i;
const JSON_EXTENSION_RE = /\.json$/i;
const CANONICAL_FIELDS = FIELD_CONFIGS.map((field) => field.name);
const CANONICAL_FIELD_SET = new Set<CanonicalLabelField>(CANONICAL_FIELDS);

export function emptyExtractedData(): ExtractedData {
  return {
    brand_name: null,
    class_type: null,
    abv: null,
    net_contents: null,
    producer: null,
    country_of_origin: null,
    government_warning: null
  };
}

export function extractedDataFromResult(result: VerificationResult): ExtractedData {
  const extracted = emptyExtractedData();
  for (const fieldResult of result.results) {
    extracted[fieldResult.field] = fieldResult.found;
  }
  return extracted;
}

export function statusFromResult(result: VerificationResult): VisibleStatus {
  return result.overall_verdict === "APPROVED" ? "Passed" : "Needs Review";
}

export function hasFailingFields(record: ApplicationPackageRecord): boolean {
  return record.comparison_result?.results.some((fieldResult) => fieldResult.status === "FAIL") ?? false;
}

export function allFieldsPass(record: ApplicationPackageRecord): boolean {
  return (
    record.comparison_result?.results.length === CANONICAL_FIELDS.length &&
    record.comparison_result.results.every((fieldResult) => fieldResult.status === "PASS")
  );
}

export function statusSortRank(status: VisibleStatus): number {
  const ranks: Record<VisibleStatus, number> = {
    "Needs Review": 0,
    Fail: 1,
    "Pending Check": 2,
    Passed: 3
  };

  return ranks[status];
}

export function buildReviewedResultsExport(
  records: ApplicationPackageRecord[],
  generatedAt = new Date().toISOString()
): ReviewedResultsExport {
  const summary = records.reduce(
    (counts, record) => {
      if (record.status === "Fail") {
        counts.failed += 1;
      } else if (record.status === "Passed") {
        counts.passed += 1;
      } else if (record.status === "Needs Review") {
        counts.needs_review += 1;
      } else {
        counts.pending += 1;
      }
      counts.total += 1;
      return counts;
    },
    { failed: 0, passed: 0, needs_review: 0, pending: 0, total: 0 }
  );

  return {
    schema_version: "application-package-review-v1",
    generated_at: generatedAt,
    summary,
    applications: records.map((record) => ({
      application_id: record.package_id,
      json_filename: record.json_filename,
      image_filename: record.image_filename,
      status: record.status,
      application_data: record.application_data,
      reviewed_extracted_data: record.reviewed_extracted_data,
      field_results: reviewedFieldResults(record),
      overall_verdict:
        record.comparison_result || Object.keys(record.field_decisions).length > 0
          ? record.status === "Passed"
            ? "APPROVED"
            : "NEEDS_REVIEW"
          : null,
      errors: [
        ...record.validation_errors.map((error) => ({
          code: error.code,
          message: error.message
        })),
        ...(record.item_error ? [{ code: "item_error", message: record.item_error }] : [])
      ]
    }))
  };
}

function reviewedFieldResults(record: ApplicationPackageRecord): VerificationResult["results"] {
  return (record.comparison_result?.results ?? []).map((fieldResult) => {
    const decision = record.field_decisions[fieldResult.field];
    if (!decision) {
      return fieldResult;
    }

    if (decision === "pass") {
      return {
        ...fieldResult,
        status: "PASS",
        message: "Reviewer marked this field as pass."
      };
    }

    return {
      ...fieldResult,
      status: "FAIL",
      message:
        decision === "fail"
          ? "Reviewer marked this field as fail."
          : "Reviewer marked this field as needs review."
    };
  });
}

export async function parseApplicationPackages(files: File[]): Promise<{
  records: ApplicationPackageRecord[];
  incomplete_records: IncompleteApplicationRecord[];
  errors: PackageValidationError[];
}> {
  const images = new Map<string, File>();
  const errors: PackageValidationError[] = [];
  const jsonFiles: File[] = [];

  for (const file of files) {
    if (isJsonFile(file)) {
      jsonFiles.push(file);
    } else if (isSupportedImageFile(file)) {
      if (images.has(file.name)) {
        errors.push({
          code: "duplicate_image_filename",
          filename: file.name,
          message: `${file.name} appears more than once. Each image filename must be unique.`
        });
      } else {
        images.set(file.name, file);
      }
    } else {
      errors.push({
        code: "unsupported_image_type",
        filename: file.name,
        message: `${file.name} is not a supported image or application JSON file.`
      });
    }
  }

  const candidates = await Promise.all(jsonFiles.map(parseJsonCandidate));
  for (const candidate of candidates) {
    errors.push(...candidate.errors);
  }

  const filenameCounts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.image_filename) {
      filenameCounts.set(
        candidate.image_filename,
        (filenameCounts.get(candidate.image_filename) ?? 0) + 1
      );
    }
  }

  for (const candidate of candidates) {
    if (!candidate.image_filename) {
      continue;
    }

    if ((filenameCounts.get(candidate.image_filename) ?? 0) > 1) {
      errors.push({
        code: "duplicate_image_filename",
        filename: candidate.file.name,
        message: `${candidate.image_filename} is named by more than one application JSON file.`
      });
    }

  }

  const referencedImageNames = new Set(
    candidates
      .map((candidate) => candidate.image_filename)
      .filter((imageFilename): imageFilename is string => Boolean(imageFilename))
  );
  const records = candidates
    .filter((candidate) => isValidCandidate(candidate, errors, images, filenameCounts))
    .map((candidate, index) => {
      const imageFile = images.get(candidate.image_filename as string) as File;
      return {
        package_id: `application-${index + 1}`,
        json_filename: candidate.file.name,
        image_filename: candidate.image_filename as string,
        image_file: imageFile,
        image_preview_url: "",
        application_data: candidate.application_data as ApplicationData,
        original_extracted_data: null,
        reviewed_extracted_data: null,
        comparison_result: null,
        field_decisions: {},
        status: "Pending Check" as VisibleStatus,
        validation_errors: [],
        item_error: null
      };
    });

  const completeJsonFilenames = new Set(records.map((record) => record.json_filename));
  const completeImageFilenames = new Set(records.map((record) => record.image_filename));
  const incompleteRecords: IncompleteApplicationRecord[] = [];

  for (const candidate of candidates) {
    if (
      candidate.errors.length === 0 &&
      candidate.image_filename &&
      candidate.application_data &&
      !completeJsonFilenames.has(candidate.file.name) &&
      (filenameCounts.get(candidate.image_filename) ?? 0) === 1 &&
      !images.has(candidate.image_filename)
    ) {
      incompleteRecords.push({
        incomplete_id: `json:${candidate.file.name}`,
        kind: "json_missing_image",
        json_filename: candidate.file.name,
        image_filename: null,
        expected_image_filename: candidate.image_filename,
        application_data: candidate.application_data,
        image_file: null,
        image_preview_url: "",
        message: `${candidate.file.name} is waiting for ${candidate.image_filename}.`
      });
    }
  }

  for (const [imageName, imageFile] of images.entries()) {
    if (!referencedImageNames.has(imageName) && !completeImageFilenames.has(imageName)) {
      incompleteRecords.push({
        incomplete_id: `image:${imageName}`,
        kind: "image_missing_json",
        json_filename: null,
        image_filename: imageName,
        expected_image_filename: null,
        application_data: null,
        image_file: imageFile,
        image_preview_url: "",
        message: `${imageName} is waiting for a matching application JSON file.`
      });
    }
  }

  return { records, incomplete_records: incompleteRecords, errors };
}

export function buildSubmissionResultsExport(
  records: ApplicationPackageRecord[],
  incompleteRecords: IncompleteApplicationRecord[],
  generatedAt = new Date().toISOString()
): SubmissionResultsExport {
  return {
    schema_version: "pretend-submission-results-v1",
    generated_at: generatedAt,
    applications: [
      ...records.map((record) => ({
        application_id: record.package_id,
        application_filename: record.json_filename,
        image_filename: record.image_filename,
        status: record.status === "Passed" ? "pass" as const : "fail" as const,
        reason: record.status === "Passed" ? "Application marked pass." : `Application marked ${record.status}.`
      })),
      ...incompleteRecords.map((record, index) => ({
        application_id: `incomplete-application-${index + 1}`,
        application_filename: record.json_filename,
        image_filename: record.image_filename ?? record.expected_image_filename,
        status: "fail" as const,
        reason:
          record.kind === "json_missing_image"
            ? "Incomplete application is missing an image."
            : "Incomplete application is missing application data."
      }))
    ]
  };
}

export async function buildPretendSubmissionZip(
  records: ApplicationPackageRecord[],
  incompleteRecords: IncompleteApplicationRecord[]
): Promise<Blob> {
  const files: ZipSourceFile[] = [];

  for (const record of records) {
    files.push({
      path: `applications/${record.json_filename}`,
      data: JSON.stringify(
        {
          image_filename: record.image_filename,
          application_data: record.application_data
        },
        null,
        2
      )
    });
    files.push({
      path: `applications/${record.image_filename}`,
      data: await readBlobArrayBuffer(record.image_file)
    });
  }

  for (const record of incompleteRecords) {
    if (record.json_filename && record.application_data) {
      files.push({
        path: `applications/${record.json_filename}`,
        data: JSON.stringify(
          {
            image_filename: record.expected_image_filename,
            application_data: record.application_data
          },
          null,
          2
        )
      });
    }
    if (record.image_filename && record.image_file) {
      files.push({
        path: `applications/${record.image_filename}`,
        data: await readBlobArrayBuffer(record.image_file)
      });
    }
  }

  files.push({
    path: "results/submission-results.json",
    data: JSON.stringify(buildSubmissionResultsExport(records, incompleteRecords), null, 2)
  });

  return createStoredZip(files);
}

interface ZipSourceFile {
  path: string;
  data: ArrayBuffer | string;
}

function createStoredZip(files: ZipSourceFile[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = typeof file.data === "string" ? encoder.encode(file.data) : new Uint8Array(file.data);
    const crc = crc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    chunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((size, chunk) => size + chunk.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  return new Blob([...chunks, ...centralDirectory, endRecord].map(uint8ArrayToArrayBuffer), {
    type: "application/zip"
  });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsArrayBuffer(blob);
  });
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isJsonFile(file: File): boolean {
  return file.type === "application/json" || JSON_EXTENSION_RE.test(file.name);
}

function isSupportedImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type) || IMAGE_EXTENSION_RE.test(file.name);
}

async function parseJsonCandidate(file: File): Promise<JsonCandidate> {
  const errors: PackageValidationError[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFileText(file)) as unknown;
  } catch {
    return {
      file,
      parsed: null,
      image_filename: null,
      application_data: null,
      errors: [
        {
          code: "invalid_json",
          filename: file.name,
          message: `${file.name} could not be read as application JSON.`
        }
      ]
    };
  }

  if (!isRecord(parsed)) {
    return {
      file,
      parsed,
      image_filename: null,
      application_data: null,
      errors: [
        {
          code: "invalid_json",
          filename: file.name,
          message: `${file.name} must contain a JSON object.`
        }
      ]
    };
  }

  const imageFilename =
    typeof parsed.image_filename === "string" && parsed.image_filename.trim()
      ? parsed.image_filename
      : null;
  if (!imageFilename) {
    errors.push({
      code: "missing_image_filename",
      filename: file.name,
      message: `${file.name} is missing image_filename.`
    });
  }

  const applicationDataValue = parsed.application_data;
  if (!isRecord(applicationDataValue)) {
    errors.push({
      code: "missing_application_data",
      filename: file.name,
      message: `${file.name} is missing application_data.`
    });
    return {
      file,
      parsed,
      image_filename: imageFilename,
      application_data: null,
      errors
    };
  }

  const applicationKeys = Object.keys(applicationDataValue);
  const missingFields = CANONICAL_FIELDS.filter((field) => {
    const value = applicationDataValue[field];
    return typeof value !== "string" || !value.trim();
  });
  const extraFields = applicationKeys.filter(
    (field): field is string => !CANONICAL_FIELD_SET.has(field as CanonicalLabelField)
  );

  if (missingFields.length > 0) {
    errors.push({
      code: "missing_canonical_fields",
      filename: file.name,
      message: `${file.name} is missing: ${missingFields.join(", ")}.`
    });
  }

  if (extraFields.length > 0) {
    errors.push({
      code: "extra_non_canonical_fields",
      filename: file.name,
      message: `${file.name} has unsupported fields: ${extraFields.join(", ")}.`
    });
  }

  const applicationData = CANONICAL_FIELDS.reduce((data, field) => {
    data[field] =
      typeof applicationDataValue[field] === "string" ? applicationDataValue[field] : "";
    return data;
  }, {} as ApplicationData);

  return {
    file,
    parsed,
    image_filename: imageFilename,
    application_data: applicationData,
    errors
  };
}

function isValidCandidate(
  candidate: JsonCandidate,
  allErrors: PackageValidationError[],
  images: Map<string, File>,
  filenameCounts: Map<string, number>
): boolean {
  if (!candidate.image_filename || !candidate.application_data || candidate.errors.length > 0) {
    return false;
  }

  if ((filenameCounts.get(candidate.image_filename) ?? 0) > 1) {
    return false;
  }

  if (!images.has(candidate.image_filename)) {
    return false;
  }

  return !allErrors.some(
    (error) =>
      error.filename === candidate.image_filename &&
      error.code === "duplicate_image_filename"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}
