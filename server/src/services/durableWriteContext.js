import { AsyncLocalStorage } from 'node:async_hooks';

// Suppress service-level notifications until the enclosing online write is durable.
export const durableWriteContext = new AsyncLocalStorage();
