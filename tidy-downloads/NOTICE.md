# Tidy Downloads

Renaming finished downloads with AI comes from [Tidy Downloads](https://github.com/Vertex-Mods/Zen-Tidy-Downloads)
by Bxthesda and Zylaah, included in Zia with their permission. This code is
theirs, reworked for Zia, and is not covered by Zia's MIT licence.

- `tidy-downloads.js`: the renaming (its AI services, prompt, rename and
  undo), slimmed to what it does in Zia, with the rename card drawn in
  Zia's look (`src/css/26-tidy-downloads.css`).
- `tidy-downloads-models.js`: fills each service's model list in Zia's
  settings with the models that service offers.

Zia loads both only with "Rename finished downloads with AI"
(`zia.features.tidy-downloads`) on (`src/js/28l-tidy-downloads.js`). The
settings keep Tidy Downloads' names (`extensions.downloads.*`).
