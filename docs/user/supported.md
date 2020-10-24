# Supported Algorithms

A number of algorithms are supported using ElasticSearch with the [analysis-phonetic plugin]() and the OpenCR Service (alone).

Algorithm | OpenCR Service | ElasticSearch
--- | --- | ---
**Exact** | Yes | Yes
[**Metaphone**](https://en.wikipedia.org/wiki/Metaphone) | Yes | Yes
[**Double-metaphone**](https://en.wikipedia.org/wiki/Metaphone#Double_Metaphone) | Yes | Yes
[**Levenshtein**](https://en.wikipedia.org/wiki/Levenshtein_distance) | Yes | Yes
[**Damerau-Levenshtein**](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance) | Yes | Yes
[**Jaro-Winkler**](https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance) | Yes | No
[**Soundex**](https://en.wikipedia.org/wiki/Soundex) | Yes | Yes

For more advanced string similarity matching, the similarity-scoring plugin for ElasticSearch can provide more features, and is based on the https://github.com/tdebatty/java-string-similarity library. 
The library is open source. 

For more information, see the [similarity-scoring repository](https://github.com/intrahealth/similarity-scoring):

Matcher Parameter for Query| Algorithm | Type | Normalized?
---|---|---|---
cosine-similarity | Cosine | similarity | yes
dice-similarity | Sorensen-Dice | similarity | yes
jaccard-similarity | Jaccard | similarity | yes
jaro-winkler-similarity | Jaro-Winkler | similarity | yes
normalized-lcs-similarity | Normalized Longest Common Subsequence | similarity | yes
normalized-levenshtein-similarity | Normalized Levenshtein | similarity | yes
cosine-distance | Cosine | distance | yes
damerau-levenshtein | Damerau-Levenshtein | distance | no
dice-distance | Sorensen-Dice | distance | yes
jaccard-distance | Jaccard | distance | yes
jaro-winkler-distance | Jaro-Winkler | distance | yes
levenshtein | Levenshtein | distance | no
longest-common-subsequence | Longest Common Subsequence | distance | no
metric-lcs | Metric Longest Common Subsequence | distance | yes
ngram | N-Gram | distance | yes
normalized-lcs-distance | Normalized Longest Common Subsequence | distance | yes
normalized-levenshtein-distance | Normalized Levenshtein | distance | yes
optimal-string-alignment | Optimal String Alignment | distance | no
qgram | Q-Gram | distance | no