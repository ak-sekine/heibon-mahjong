import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ACTION_PANEL_TEMPLATE_PARTS } from '../src/ui/action-panel.ts';

const pages = ['index.html', 'kan-test.html'].map((file) => ({
  file,
  html: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
}));

function templateBody(html: string, id: string, file: string): string {
  const match = html.match(new RegExp(`<template id="${id}">([\\s\\S]*?)<\\/template>`));
  assert.ok(match, `${file} must include #${id}`);
  return match[1];
}

function parts(markup: string, attribute: string): string[] {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))]
    .map((match) => match[1])
    .sort();
}

function normalized(markup: string): string {
  return markup.replace(/\s+/g, ' ').trim();
}

test('offline entry pages expose the same local table root and shared templates', () => {
  const templateIds = ['score-strip-template', 'table-info-template', 'game-controls-template'];
  for (const { file, html } of pages) {
    const localTableMatches = [...html.matchAll(/<section\b[^>]*\bid="local-table"[^>]*>/g)];
    assert.equal(localTableMatches.length, 1, `${file} must expose one canonical #local-table root`);
    assert.match(localTableMatches[0][0], /\bclass="[^"]*\btable\b/);
  }

  for (const id of templateIds) {
    const [first, second] = pages.map(({ file, html }) => normalized(templateBody(html, id, file)));
    assert.equal(second, first, `${id} must match between offline entry pages`);
  }
});

test('shared templates provide all mode-specific mount parts and positions', () => {
  const expectedActionParts = [...ACTION_PANEL_TEMPLATE_PARTS].sort();
  const expectedScorePositions = ['bottom', 'left', 'right', 'top'];
  const expectedTableInfoParts = ['deposits', 'dora', 'round', 'wall'];

  for (const { file, html } of pages) {
    assert.deepEqual(
      parts(templateBody(html, 'game-controls-template', file), 'data-panel-part'),
      expectedActionParts,
      `${file} must provide every action-panel part required by either mode`,
    );
    assert.deepEqual(
      parts(templateBody(html, 'score-strip-template', file), 'data-seat-position'),
      expectedScorePositions,
      `${file} must provide all four score-strip positions`,
    );
    assert.deepEqual(
      parts(templateBody(html, 'table-info-template', file), 'data-table-info-part'),
      expectedTableInfoParts,
      `${file} must provide every central table-information part`,
    );
  }
});
