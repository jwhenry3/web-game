//go:build !standalone

package host

// WantStandaloneBuild is false unless FANTASY_STANDALONE is set at runtime.
func WantStandaloneBuild() bool { return false }
