# Intro to Algorithms

Algorithms can be deterministic, fuzzy, probabilistic, or a combination of approaches; most include some element of automatic matching plus human review. No perfect algorithm currently exists [^1]. Typically, the creator(s) of the client registry will agree on the appropriate threshold to determine a "match" and this may need to be recalibrated over time.

## Approaches

Types of matching approaches:

* **Deterministic**. This can be thought of enforcing exact matches. This type of matching performs poorly when the quality of the data is low and/or the discriminatory power of the variable used for matching is low (e.g. sex is a poor discriminatory variable). If exact matching is enforced, the data scientist should verify that other fields also match using a combination of approaches, as needed.

* **Fuzzy**. The fuzzy match method relies on converting items to their core components (e.g. phonetics) to determine matching rather than relying on probabilities. This method’s strength is addressing typing errors but remains imperfect in cases where words are similar, but are not the same (e.g. there, their). Its efficacy is unproven in most languages other than English.

* **Probabilistic**. This is a method that assigns a match probability to a pair of records. The most common method (Fellegi-Sunter) checks a number of fields and sums up the probabilities that each field is a match. Higher scores indicate a match. Recent research has been directed at improving the FS method [^2].

Matching algorithms are evaluated based on their sensitivity and specificity in detecting matches. One caveat to remember is to check whether the sensitivity and specificity reported are with or without human review. Generally, it is better to minimize the chances of a false positive; however, as false positives go towards zero false negatives increase and the balance must be maintained.


## Types of Deterministic Matching

* **Field-based (exact) matching**. Typically fields are compared to each other across data sets and a result is a match or non-match, thus deterministic.

## Types of Fuzzy Matching

Methods that assist in matching based on phonetic transformations to remedy spelling errors:

* **Soundex** indexes names by sound as pronounced in English. The Soundex encoding includes the first letter of a surname followed by 3 digits. This method relies on correctly recording the first letter of a name.
* **Metaphone** indexes words by their English pronunciation.
* **Double Metaphone** implements Metaphone but allows for two encodings to be returned for a word rather than constraining it to one choice. It works well with names of various origins, but the lettering must be English.
* **Metaphone 3** is the next generation of Double Metaphone and is a commercial product. 

Methods that compare string similarity:

* **Levenshtein edit distance** is a measure of the number of edits (insertions and deletions) that would be required to change one string to another.
* **Jaro-Winkler** comparator/distance is similar to Levenshtein, but it gives more weight to strings that match on the beginning of the string. 0 is an exact match. Lower scores are better than higher scores. If the beginning of the string is misspelled, this will not work as well.
* **Longest common subsequence** matches subsequences within strings. Subsequences do not need to match positions.

## Types of Probabilistic Matching

The most widely used probabilistic matching method is the **Fellegi-Sunter method** [^3]. In this method, each field is weighted by its discriminatory power and data quality; could be manually or via model training [^4]. The algorithm checks each field and decides whether the field matches between the pairs or not. If the fields match, the weight is added to the final score. If the fields do not match, the weight is subtracted from the final score. If the sum of the weights is above a threshold, they are considered a match. Possible matches can also be produced and these would require human review.

One drawback is that this method assumes that no fields are correlated with each other or that they are not conditionally dependent. The assumption of conditional independence does not always hold and can lead to suboptimal results which is the biggest limitation of this method [^5]. For example, there are more women named Barbara than men named Barbara. First name and sex are not independent. 

Extensions to the F-S method include: 

* The **approximate comparator extension** (ACE) [^6] which includes string matching strategies prior to performing the weighting and scoring.

Alternatives to F-S include (see [video](https://www.youtube.com/watch?v=5zY8FfAIyOg)):

* **GHC Scaling Algorithm** [^7] is an order of magnitude faster than F-S. Calculates underlying weights and doesn’t rely on independence assumption.

## Speed

Methods to reduce the number of comparisons and speed up the process:

* **Blocking**. This is like sorting socks by color before trying to match them. It speeds up the process by reducing the number of pairs that need to be checked.

[^1]: McFarlane, T. D., Dixon, B. E., & Grannis, S. J. (2016). Client registries: identifying and linking patients. In Health Information Exchange (pp. 163-182). Academic Press.

[^2]: Li, X., Xu, H., Shen, C., & Grannis, S. (2018). Automated linkage of patient records from disparate sources. Statistical methods in medical research, 27(1), 172-184. DuVall, Scott L., Richard A. Kerber, and Alun Thomas. "Extending the Fellegi–Sunter probabilistic record linkage method for approximate field comparators." Journal of biomedical informatics 43.1 (2010): 24-30.

[^3]: McFarlane, T. D., Dixon, B. E., & Grannis, S. J. (2016). Client registries: identifying and linking patients. In Health Information Exchange (pp. 163-182). Academic Press.

[^4]: DuVall, Scott L., Richard A. Kerber, and Alun Thomas. "Extending the Fellegi–Sunter probabilistic record linkage method for approximate field comparators." Journal of biomedical informatics 43.1 (2010): 24-30.

[^5]: Li, X., Xu, H., Shen, C., & Grannis, S. (2018). Automated linkage of patient records from disparate sources. Statistical methods in medical research, 27(1), 172-184.

[^6]: DuVall, Scott L., Richard A. Kerber, and Alun Thomas. "Extending the Fellegi–Sunter probabilistic record linkage method for approximate field comparators." Journal of biomedical informatics 43.1 (2010): 24-30. 

[^7]: Goldstein, H., Harron, K., & Cortina‐Borja, M. (2017). A scaling approach to record linkage. Statistics in medicine, 36(16), 2514-2521.

