import os from 'node:os';
import {
  AGENT_AUTH_TOKEN,
  AGENT_VERSION,
  ALLOW_REMOTE_COMMANDS,
  ALLOW_SCREENSHOT,
  ALLOW_UNLOCK,
  COMMAND_EXECUTION_MODE,
  SCHEMA_VERSION,
} from '../config.js';
import { getPublicAppsList } from './apps-config.js';

export function buildAgentAuthMessage() {
  return {
    type: 'agent_auth',
    payload: {
      token: AGENT_AUTH_TOKEN,
      agentVersion: AGENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      hostname: os.hostname(),
      capabilities: buildCapabilities(),
    },
  };
}

export function buildCapabilities() {
  return {
    lock: ALLOW_REMOTE_COMMANDS,
    unlock: ALLOW_REMOTE_COMMANDS && ALLOW_UNLOCK,
    sleep: ALLOW_REMOTE_COMMANDS,
    hibernate: ALLOW_REMOTE_COMMANDS,
    shutdown: ALLOW_REMOTE_COMMANDS,
    restart: ALLOW_REMOTE_COMMANDS,
    launchApp: ALLOW_REMOTE_COMMANDS,
    stopApp: ALLOW_REMOTE_COMMANDS,
    clearTemp: ALLOW_REMOTE_COMMANDS,
    screenshot: ALLOW_REMOTE_COMMANDS && ALLOW_SCREENSHOT,
    apps: getPublicAppsList(),
    executionMode: COMMAND_EXECUTION_MODE,
  };
}
