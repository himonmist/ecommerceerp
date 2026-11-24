import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP 2024 guidance for argon2id: m=19 MiB, t=2, p=1.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, { ...OPTS, algorithm: 2 /* Argon2id */ });
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** A real hash, computed once, used to equalise timing when the account does not exist. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("timing-equaliser-not-a-real-password");
  return dummy;
}
