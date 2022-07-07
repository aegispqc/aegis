version 0.0.4 is now available from:

  https://github.com/aegispqc/aegis/releases/tag/v0.0.4

This is a new major version release, bringing both new features and
bug fixes.

Please report bugs using the issue tracker at github:

  https://github.com/aegispqc/aegis/issues

# How to Upgrade
If you are running an older version, shut it down. Wait until it has completely
shut down, Then overwrite the old app executable with the new app.

# Notable changes

1. Optimized network module.
2. Replaced the packing modules. (caxa -> pkg)
3. Fixed some RPC commands.
4. Updated the database. (lmdbJs 2.1.6 -> 2.5.3)
5. Added a spare module for shake256 to implement. (used tiny sha3: https://github.com/mjosaarinen/tiny_sha3)
6. Updated the AEGIS miner core.