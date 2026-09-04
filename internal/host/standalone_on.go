//go:build standalone

package host

// WantStandaloneBuild is true when compiled with -tags standalone.
func WantStandaloneBuild() bool { return true }
