{
  description = "Paper stack component";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            git
            nodejs_24
          ];

          shellHook = ''
            if [ -f package.json ] && [ ! -d node_modules ]; then
              npm install
            fi

            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };
      }
    );
}
