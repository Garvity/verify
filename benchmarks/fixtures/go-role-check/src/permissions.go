package permissions

func canDeleteUsers(role string) bool {
	return role != "viewer"
}
