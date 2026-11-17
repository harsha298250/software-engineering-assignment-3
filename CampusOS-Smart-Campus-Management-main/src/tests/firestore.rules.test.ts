import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('Firestore Security Rules Static & Policy Verification', () => {
  it('enforces rules_version = 2 and global default-deny catch-all', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  });

  it('requires verified email on isSignedIn and protects against privilege escalation on user create', () => {
    expect(rulesText).toContain('request.auth.token.email_verified == true');
    expect(rulesText).toContain("incoming().role in ['STUDENT', 'FACULTY']");
    expect(rulesText).not.toContain('allow read: if isSignedIn()');
    expect(rulesText).not.toContain('allow list: if isSignedIn();');
  });

  it('covers all collections defined in firebase-blueprint.json', () => {
    const blueprint = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8')
    );
    const collectionPaths = Object.keys(blueprint.firestore || {});
    for (const p of collectionPaths) {
      const collectionName = p.split('/')[1];
      expect(rulesText).toContain(`match /${collectionName}/`);
    }
  });

  it('enforces id validation, server timestamps, and schema hasOnly checks', () => {
    expect(rulesText).toContain('function isValidId(id)');
    expect(rulesText).toContain('function emailInviteId(email)');
    expect(rulesText).toContain('match /role_invites/{inviteId}');
    expect(rulesText).toContain('incoming().createdAt == request.time');
    expect(rulesText).toContain('incoming().updatedAt == request.time');
    expect(rulesText).toContain('data.keys().hasOnly(');
    expect(rulesText).toContain('affectedKeys().hasOnly(');
  });
});
