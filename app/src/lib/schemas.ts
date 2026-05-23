import {z} from "zod";

/** Validación de dirección Ethereum */
export const addressSchema = z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid Ethereum address");

/** Validación de nombre RNS */
export const rnsNameSchema = z
    .string()
    .regex(/^.+\.(ron|roninchain)$/, "Invalid RNS name (e.g. alice.ron)");

/** Dirección o RNS */
export const addressOrRnsSchema = z.union([addressSchema, rnsNameSchema]);

/** Token ID */
export const tokenIdSchema = z
    .string()
    .regex(/^\d+$/, "Token ID must be a positive integer")
    .refine((v) => BigInt(v) >= 0n, "Token ID must be non-negative");

/** Cantidad de pago */
export const amountSchema = z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number")
    .refine((v) => Number(v) > 0, "Amount must be greater than 0");

/** Decimales del token */
export const decimalsSchema = z
    .string()
    .regex(/^\d+$/, "Decimals must be a number")
    .refine((v) => Number(v) >= 0 && Number(v) <= 36, "Decimals must be 0–36");

/** Deadline en minutos */
export const deadlineSchema = z
    .string()
    .regex(/^\d+$/, "Deadline must be a number")
    .refine((v) => Number(v) >= 1 && Number(v) <= 10080, "Deadline must be 1–10080 minutes (max 7 days)");

/** Schema completo del formulario de intent */
export const intentFormSchema = z.object({
    nftContract: addressOrRnsSchema,
    tokenId: tokenIdSchema,
    paymentToken: addressSchema,
    paymentDecimals: decimalsSchema,
    amount: amountSchema,
    deadlineMinutes: deadlineSchema,
});

export type IntentFormData = z.infer<typeof intentFormSchema>;

/** Valida un campo individual y retorna error o null */
export function validateField<K extends keyof IntentFormData>(
    field: K,
    value: string,
): string | null {
    const schema = intentFormSchema.shape[field];
    const result = schema.safeParse(value);
    return result.success ? null : result.error.errors[0]?.message ?? "Invalid";
}