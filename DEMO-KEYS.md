# Demo keys for ocamlearlybird

Do NOT use these keys for production.

From:

```sh
./dk1 prepare-version --ci github 1.3
```

we recorded the Q&A session below.
Normally you would save it all as a secure note in your favorite password manager:

```text
-----------------
Define Library Id
-----------------

The library id is the hierarchical base of all the modules that your
distributions export. It is in the three-part form `VendorQualifier_Unit`
like `FooBar_Baz` or `FooBar_FizzBizz`.

To share your modules with others and avoid naming conflicts, your library
id must be registered and have a distribution key (we'll generate one for
you later).

Good "Vendors" and "Qualifiers" relate to your domain or real name.
Reserved "Vendors" include:
  `Commons`, `Std`, `Dk`, `Ml`, `Our`, `Thunk`, `Zz`

A good "Unit" is either `Std`, or is related to your product or project.

Enter library id (leave blank to quit): NotHackwaly_Ocamlearlybird
NotHackwaly_Ocamlearlybird

--------------------------------
Key Pair for current version 1.3
--------------------------------

STORE the following key pair safely (ex. secure password manager) -or-
PRINT it and store it in two or more safe places.

    -- name of keypair --
NotHackwaly_Ocamlearlybird-1.3

    -- public key 1.3 --
untrusted comment: NotHackwaly_Ocamlearlybird-1.3|RWS5iRatcyGHX6NTdJ3Zrv9lhpWPrw9khAMAsHbWZa3vwkaCzDJRXrXR

    -- secret key 1.3 --
untrusted comment: NotHackwaly_Ocamlearlybird-1.3|RWRCSwAAAADfxp0ThqnKUqKOXq10gz+IYV1xqtw4K/25iRatcyGHX+gX7j3vYtSe5KP3PmLS95snRt8r3SX8JHCMUxGXio5zo1N0ndmu/2WGlY+vD2SEAwCwdtZlre/CRoLMMlFetdE=

Did you securely store the keypair above?

Y. Yes, I have saved the keypair
Q. Quit

Enter Y or Q: y
y

----------------------------------------------
CI Identity Information for You (the Producer)
----------------------------------------------

1. (simple; most common) Enter GitHub SLSA v1 Level 2 details.
   https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations#generating-artifact-attestations-for-your-builds
   Details to attest (prove) that your builds have no tampering of values
   after GitHub Actions finishes.
2. (most secure) Enter GitHub SLSA v1 Level 3 details.
   https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating 
   Details to attest (prove) that there will be no tampering of values
   during your builds by using a known, vetted GitHub Actions script.
C. Continue without CI identity
Q. Quit

Enter 1, 2, C or Q: 1
1

Enter GitHub repository (ex. "owner/repo"): jonahbeckford/ocamlearlybird
jonahbeckford/ocamlearlybird

--------------------------------
Define Your Distribution License
--------------------------------

1. Enter SPDX license (ex. "Apache-2.0"). Strongly permissive licenses
   like BlueOak-1.0.0, BSD-2-Clause-Patent and Apache-2.0 will not
   prompt your users to accept the license.
2. Enter plain license text
3. Enter license text in Markdown format
Q. Quit

Enter 1, 2, 3 or Q: 1
1
Enter SPDX license identifier (ex. "Apache-2.0"; "q" to quit): MIT
MIT

----------------------------------------
Key Pair for next minor version bump 1.4
----------------------------------------

STORE the following key pair safely (ex. secure password manager) -or-
PRINT it and store it in two or more safe places.

    -- name of keypair --
NotHackwaly_Ocamlearlybird-1.4

    -- public key 1.4 --
untrusted comment: NotHackwaly_Ocamlearlybird-1.4|RWQZzxNUJsjQ/Jvo4twU6vt8wFACHOucOBipn+i2DWBI/UyQcG6fq+Sc

    -- secret key 1.4 --
untrusted comment: NotHackwaly_Ocamlearlybird-1.4|RWRCSwAAAAC0QIfcxsJyZgrg/8S1m+P3YLN0IubKOtgZzxNUJsjQ/GDDya0OsPkxeTzsill8Ow9+cw1wmhYvTgFiJ8rb7zBNm+ji3BTq+3zAUAIc65w4GKmf6LYNYEj9TJBwbp+r5Jw=

Did you securely store the keypair above?

Y. Yes, I have saved the keypair
Q. Quit

Enter Y or Q: y
y

----------------------------------------
Key Pair for next major version bump 2.0
----------------------------------------

STORE the following key pair safely (ex. secure password manager) -or-
PRINT it and store it in two or more safe places.

    -- name of keypair --
NotHackwaly_Ocamlearlybird-2.0

    -- public key 2.0 --
untrusted comment: NotHackwaly_Ocamlearlybird-2.0|RWQh+ThJhASGk+QRWB7rnF33W5z90ZfFjxkRRgLjqLhW4wg0FSMowMjI

    -- secret key 2.0 --
untrusted comment: NotHackwaly_Ocamlearlybird-2.0|RWRCSwAAAABHH9nRCfY1QOPw81Y7/OD47C4BG5ehiWwh+ThJhASGk6jwqBxUbkbBCPGaEiVV37uugs1I1K0zZLVwcg4+5nhJ5BFYHuucXfdbnP3Rl8WPGRFGAuOouFbjCDQVIyjAyMg=

Did you securely store the keypair above?

Y. Yes, I have saved the keypair
Q. Quit

Enter Y or Q: y
y
{
  "continuations": {
    "attestation": {
      "openbsd_signify": {
        "signature": "untrusted comment: signed by key b98916ad7321875f\nRWS5iRatcyGHXzE+NoZhCVLSHmy7+nrpX4i3BctxIBgb5mz21Cu8JD9zd2ltJZl9z8cPyP+tAr0RGa77G0RBF/ixqJ8UcLoJTwc=\n"
      }
    },
    "continuations_to_sign": {
      "1.4": {
        "application": { "name": "dk0", "version": "2.4.2+rev-313" },
        "openbsd_signify": {
          "public_key": "untrusted comment: NotHackwaly_Ocamlearlybird-1.4\nRWQZzxNUJsjQ/Jvo4twU6vt8wFACHOucOBipn+i2DWBI/UyQcG6fq+Sc\n"
        }
      },
      "2.0": {
        "application": { "name": "dk0", "version": "2.4.2+rev-313" },
        "openbsd_signify": {
          "public_key": "untrusted comment: NotHackwaly_Ocamlearlybird-2.0\nRWQh+ThJhASGk+QRWB7rnF33W5z90ZfFjxkRRgLjqLhW4wg0FSMowMjI\n"
        }
      }
    }
  },
  "id": "NotHackwaly_Ocamlearlybird@1.3.0",
  "license": { "spdx": "MIT" },
  "producer": {
    "application": { "name": "dk0", "version": "2.4.2+rev-313" },
    "github_slsa_v1_l2": { "repository": "jonahbeckford/ocamlearlybird" },
    "openbsd_signify": {
      "public_key": "untrusted comment: NotHackwaly_Ocamlearlybird-1.3\nRWS5iRatcyGHX6NTdJ3Zrv9lhpWPrw9khAMAsHbWZa3vwkaCzDJRXrXR\n"
    }
  }
}
Saved etc/dk/d/1.3.0.dist.json
Saved .github/workflows/distribute-1.3.yml

------------

Your workflow `.github/workflows/distribute-1.3.yml`
requires two GitHub secrets set in a `dk-distribution` environment
to sign the distributions:

  - `distribute_1_3_pubkey` - the public key for `NotHackwaly_Ocamlearlybird-1.3`
  - `distribute_1_3_seckey` - the secret key for `NotHackwaly_Ocamlearlybird-1.3`

You can set these secrets now with the GitHub CLI!
1. Download GitHub CLI from https://cli.github.com/.

2. Create the dk-distribution environment with:

  gh api --method PUT -H "Accept: application/vnd.github+json" repos/jonahbeckford/ocamlearlybird/environments/dk-distribution

3. Run the following, then copy and paste the text
("untrusted comment: ...|RW...") of the PUBLIC key
`NotHackwaly_Ocamlearlybird-1.3`:

  gh secret set --repo jonahbeckford/ocamlearlybird --env dk-distribution distribute_1_3_pubkey

4. Run the following, then copy and paste the text
("untrusted comment: ...|RW...") of the SECRET key
`NotHackwaly_Ocamlearlybird-1.3`:

  gh secret set --repo jonahbeckford/ocamlearlybird --env dk-distribution distribute_1_3_seckey

Full docs at https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-environment.
```
