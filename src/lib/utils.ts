import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function short(value: string, length = 6) {
  return value
    ? `${value.slice(0, length + 2)}...${value.slice(-length)}`
    : "Not recorded";
}
