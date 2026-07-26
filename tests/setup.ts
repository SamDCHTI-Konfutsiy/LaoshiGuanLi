import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

export function makeTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'ems-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

export const TIMESTAMP_FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
export const TIMESTAMP_PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
