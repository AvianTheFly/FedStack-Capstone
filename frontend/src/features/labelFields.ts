import type {
  ApplicationData,
  CanonicalLabelField,
  FieldResult,
  VerificationResult
} from "../types/api";

export interface FieldConfig {
  name: CanonicalLabelField;
  label: string;
  errorMessage: string;
  multiline?: boolean;
}

export const FIELD_CONFIGS: FieldConfig[] = [
  { name: "brand_name", label: "Brand Name", errorMessage: "Enter the brand name." },
  { name: "class_type", label: "Class / Type", errorMessage: "Enter the class or type." },
  { name: "abv", label: "Alcohol Content", errorMessage: "Enter the alcohol content." },
  { name: "net_contents", label: "Net Contents", errorMessage: "Enter the net contents." },
  { name: "producer", label: "Producer", errorMessage: "Enter the producer." },
  {
    name: "country_of_origin",
    label: "Country of Origin",
    errorMessage: "Enter the country of origin."
  },
  {
    name: "government_warning",
    label: "Government Warning",
    errorMessage: "Enter the government warning.",
    multiline: true
  }
];

export const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const emptyApplicationData: ApplicationData = {
  brand_name: "",
  class_type: "",
  abv: "",
  net_contents: "",
  producer: "",
  country_of_origin: "",
  government_warning: ""
};

export function fieldLabel(field: CanonicalLabelField): string {
  return FIELD_CONFIGS.find((config) => config.name === field)?.label ?? field;
}

export function resultOrder(result: FieldResult): number {
  return FIELD_CONFIGS.findIndex((config) => config.name === result.field);
}

export function formatVerdict(verdict: VerificationResult["overall_verdict"]): string {
  return verdict === "APPROVED" ? "APPROVED" : "NEEDS REVIEW";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
