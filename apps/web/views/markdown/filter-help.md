In the search bar, you can enter key words to search within all text attributes of beatmaps, but you can also use filters to easily get beatmaps fitting the exact criteria you specify.

Filters can be used in addition to text searches as long as you separate them with spaces.

A filter might look like `stars>5.5` or `year=2019`. They take the form of `key operator value`, where `key` is the attribute you want to filter, `operator` is the comparison you want to make, and `value` is the value you want to match.

Valid filter keys include:

- `mode`: Map mode, accepts all valid mode names and abbreviations
- `status`: Map ranked status, accepts all valid status names and single-letter abbreviations
- `ranked`, `date`, `year`, `month`, or `day`: Map ranked date, accepts `YYYY-MM-DD`, `YYYY-MM`, or `YYYY` date formats
- `submitted`: Map submitted date, accepts `YYYY-MM-DD`, `YYYY-MM`, or `YYYY` date formats
- `title`: Song title
- `artist`: Song artist
- `mapper`: Mapper name
- `diff`, or `version`: Difficulty name
- `stars`, `star`, or `sr`: Star rating/difficulty
- `length`, `duration`, or `seconds`: Total map length in seconds
- `cs`: Circle size (CS) (or key count in mania)
- `ar`: Approach rate (AR)
- `od`, `acc`, or `accuracy`: Overall difficulty (OD)
- `hp` or `health`: HP drain
- `keys`: Mania keycount
- `bpm`: Map BPM
- `circles`, `notes`, `hits`, or `fruits`: Primary single-hit note count, depends on mode
- `sliders`, `drumrolls`, `longnotes`, `holdnotes`, or `holds`: Secondary slider/long note count, depends on mode
- `spinners`, `streams`, `swells`, `showers`, or `bananas`: Special spinner/shower count, depends on mode
- `pack`: Maps contained within a specific pack by ID

Valid operators include:

- `=` or `:`: Equal to
- `<`: Less than
- `>`: Greater than
- `<=`: Less than or equal to
- `>=`: Greater than or equal to

Additional notes:

- **Range filters:** You can use a hyphen to specify a range, like `length=90-180` (between 90 and 180 seconds). This works for all numeric filters.
- **List filters:** You can separate values with commas, like `year=2019,2021,2023`, to find maps matching ANY of those values.
- **Smart integer ranges:** Providing a whole number like `stars=5` will automatically search the full range (e.g. from 5.00 up to 6.00).
- **Exclusive Constraints:** Filters are additive (`AND` logic). Using `stars=5` and `stars=6` together will yield zero results because a map cannot be both 5 stars AND 6 stars at the same time.

To recap, consider the search query `stars = 5.5-7 ar>9 freedom dive`. Using the above, we can deduce that this query finds maps whose titles or artists are similar to "freedom dive", between 5.5 and 7 stars, with an AR greater than 9.
