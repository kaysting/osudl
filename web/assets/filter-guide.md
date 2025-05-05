By default, typing in the search box will search within all beatmap titles, artists, and difficulty names, but search also supports advanced filters with the inclusion of filter strings like:

`attribute=value` or `attribute="some text"`

Which would only show results where `attribute` matches `value`.

In addition to `=`, you can also use the inequality operators `>`, `>=`, `<`, and `<=`, and add multiple filters by separating them with spaces.

Text attributes only support the `=` operator and require quotes (`" "`) around the value if it contains spaces, as shown above. They also employ fuzzy search, meaning similar but not exact matches will be shown as well.

An example of a common filtered search might be:

`title="freedom dive" mode=osu stars>5`

Which would return **all osu!standard maps whose titles are similar to "freedom dive" and have a star difficulty rating greater than 5**.

All of the available search/filter attributes are as follows (case-insensitive):

- `title` - Search within song titles.
- `artist` - Search within song artists.
- `mapper` - Search within mapper names. This does not include guest mappers.
- `diffname` or `diff` - Search within mapset difficulty names.
- `source` - Search within mapset sources.
- `date` or `rankdate` - Filter maps by the date they were ranked. Accepts dates in `yyyy-mm-dd`, `yyyy-mm`, or `yyyy` format. All operators are supported.
- `submitdate` - Filter maps by the date they were submitted. Accepts dates in the same format as `date`.
- `nsfw` - Filter maps that are/aren't NSFW. Accepts truthy/falsy values such as `true` or `false`, `1` or `0`, etc.
- `video` - Filter maps that do or don't have video. Accepts truthy/falsy values such as `true` or `false`, `1` or `0`, etc.
- `plays` or `playcount` - Filter maps by their total play count (across all difficulties).
- `mode` - Filter maps by mode. Valid values are `osu`, `taiko`, `catch`, or `mania`, or the first letters of those.
- `stars` or `sr` - Filter mapsets by star difficulty rating.
- `bpm` - Filter mapsets by song BPM.
- `length` - Filter mapsets by length (in seconds).
- `cs` - Filter mapsets by their circle size (or key count for mania).
- `keys` - Filter osu!mania maps by their key count. Results only include mania mapsets.
- `ar` - Filter mapsets by their approach rate.
- `od` - Filter mapsets by their overall difficulty.
- `hp` - Filter mapsets by their HP drain.
- `circles` - Filter mapsets by their circle count.
- `sliders` - Filter mapsets by their slider count.
- `spinners` - Filter mapsets by their spinner count.
- `pp` - Filter mapsets by the max pp value of one or more of their difficulties with no mods applied.
- `pp.MODS` - Same as `pp`, but applies game mods to the pp value. Replace `MODS` with one of: `ez`, `ht`, `hd`, `hr`, `dt`, `ezht`, `ezdt`, `hdhr`, `hddt`, `hrdt`, `hdhrdt`.