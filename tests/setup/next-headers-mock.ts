import { jarStore } from "./cookie-jar";

export const cookies = async () => jarStore;
export const headers = async () => new Map<string, string>();
