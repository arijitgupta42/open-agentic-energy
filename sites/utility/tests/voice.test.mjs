// Every front agent carries the same short voice line (issue #21), and every agent stays
// within the 5,000-character instruction budget once placeholders are expanded
// (CLAUDE.md rule 3). It reads all three sites, so it lives here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SITES = {
  utility: "emberwick_energy",
  installer: "heatwright_installers",
  grants: "fernbrook_grants",
};

/**
 * Read a site's published network.
 *
 * :param site: The site's folder.
 * :return: The network JSON.
 */
async function network(site) {
  return JSON.parse(await readFile(new URL(`../../${site}/${SITES[site]}.network.json`, import.meta.url), "utf8"));
}

/**
 * Expand an agent's instructions as the runtime does: each {name} once.
 *
 * :param config: The network JSON.
 * :param text: The instructions.
 * :return: The expanded text.
 */
function expand(config, text) {
  const strings = config.commondefs?.replacement_strings || {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (Object.hasOwn(strings, name) ? strings[name] : match));
}

test("every site has the same voice line, and each front agent uses it", async () => {
  const lines = new Set();
  for (const site of Object.keys(SITES)) {
    const config = await network(site);
    const voice = config.commondefs.replacement_strings.voice_rules;
    assert.ok(voice, `${site}: commondefs.replacement_strings.voice_rules is missing.`);
    lines.add(voice.trim());
    const front = config.tools[0];
    assert.ok(front.instructions.includes("{voice_rules}"), `${site}: ${front.name} lacks {voice_rules}.`);
  }
  assert.equal(lines.size, 1, "voice_rules differs between sites. Keep it the same on all three.");
  const [line] = lines;
  assert.ok(line.length <= 200, `The voice line is ${line.length} characters. Keep it about 200 or fewer.`);
});

test("every agent's instructions stay within 5,000 characters after expansion", async () => {
  for (const site of Object.keys(SITES)) {
    const config = await network(site);
    for (const agent of config.tools) {
      if (typeof agent.instructions === "string") {
        const length = expand(config, agent.instructions).length;
        assert.ok(length <= 5000, `${site} ${agent.name}: ${length} characters.`);
        assert.doesNotMatch(expand(config, agent.instructions), /\{[A-Za-z0-9_]+\}/, `${site} ${agent.name}: an unexpanded placeholder.`);
      }
    }
  }
});
