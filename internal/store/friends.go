package store

import "strings"

func friendListHas(list []string, name string) bool {
	for _, n := range list {
		if strings.EqualFold(n, name) {
			return true
		}
	}
	return false
}

func friendListRemove(list []string, name string) []string {
	out := make([]string, 0, len(list))
	for _, n := range list {
		if !strings.EqualFold(n, name) {
			out = append(out, n)
		}
	}
	return out
}

func (s *Store) linkFriendsLocked(a, b *Profile) string {
	if len(a.Friends) >= 50 {
		return "Your friend list is full."
	}
	if len(b.Friends) >= 50 {
		return a.Name + "'s friend list is full."
	}
	if !friendListHas(a.Friends, b.Name) {
		a.Friends = append(a.Friends, b.Name)
	}
	if !friendListHas(b.Friends, a.Name) {
		b.Friends = append(b.Friends, a.Name)
	}
	a.IncomingFriendRequests = friendListRemove(a.IncomingFriendRequests, b.Name)
	a.OutgoingFriendRequests = friendListRemove(a.OutgoingFriendRequests, b.Name)
	b.IncomingFriendRequests = friendListRemove(b.IncomingFriendRequests, a.Name)
	b.OutgoingFriendRequests = friendListRemove(b.OutgoingFriendRequests, a.Name)
	return ""
}

// SendFriendRequest queues an incoming request for the target hero.
func (s *Store) SendFriendRequest(fromName, toName string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	from, _ := s.findProfileLocked(fromName)
	if from == nil {
		return Profile{}, "Unknown hero."
	}
	toName = strings.TrimSpace(toName)
	if toName == "" {
		return *from, "Enter a hero name."
	}
	if strings.EqualFold(toName, from.Name) {
		return *from, "You cannot friend yourself."
	}
	to, _ := s.findProfileLocked(toName)
	if to == nil {
		return *from, "No hero with that name exists."
	}
	if friendListHas(from.Friends, to.Name) {
		return *from, "Already on your friend list."
	}
	if friendListHas(from.OutgoingFriendRequests, to.Name) {
		return *from, "Friend request already sent."
	}
	if friendListHas(from.IncomingFriendRequests, to.Name) {
		if msg := s.linkFriendsLocked(from, to); msg != "" {
			return *from, msg
		}
		s.save()
		return *from, ""
	}
	if friendListHas(to.IncomingFriendRequests, from.Name) {
		return *from, "They already have your pending request."
	}
	to.IncomingFriendRequests = append(to.IncomingFriendRequests, from.Name)
	from.OutgoingFriendRequests = append(from.OutgoingFriendRequests, to.Name)
	s.save()
	return *from, ""
}

// AcceptFriendRequest adds both heroes as friends and clears pending requests.
func (s *Store) AcceptFriendRequest(accepterName, fromName string) (Profile, Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	accepter, _ := s.findProfileLocked(accepterName)
	if accepter == nil {
		return Profile{}, Profile{}, "Unknown hero."
	}
	fromName = strings.TrimSpace(fromName)
	if fromName == "" {
		return *accepter, Profile{}, "Enter a hero name."
	}
	if !friendListHas(accepter.IncomingFriendRequests, fromName) {
		return *accepter, Profile{}, "No friend request from that hero."
	}
	other, _ := s.findProfileLocked(fromName)
	if other == nil {
		accepter.IncomingFriendRequests = friendListRemove(accepter.IncomingFriendRequests, fromName)
		s.save()
		return *accepter, Profile{}, "That hero no longer exists."
	}
	if msg := s.linkFriendsLocked(accepter, other); msg != "" {
		return *accepter, Profile{}, msg
	}
	s.save()
	return *accepter, *other, ""
}

// DeclineFriendRequest removes a pending friend request.
func (s *Store) DeclineFriendRequest(declinerName, fromName string) (Profile, Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	decliner, _ := s.findProfileLocked(declinerName)
	if decliner == nil {
		return Profile{}, Profile{}, false
	}
	fromName = strings.TrimSpace(fromName)
	if fromName == "" || !friendListHas(decliner.IncomingFriendRequests, fromName) {
		return *decliner, Profile{}, false
	}
	decliner.IncomingFriendRequests = friendListRemove(decliner.IncomingFriendRequests, fromName)
	var other *Profile
	if p, _ := s.findProfileLocked(fromName); p != nil {
		other = p
		other.OutgoingFriendRequests = friendListRemove(other.OutgoingFriendRequests, decliner.Name)
	}
	s.save()
	if other != nil {
		return *decliner, *other, true
	}
	return *decliner, Profile{}, true
}

func (s *Store) RemoveFriend(name, friendName string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	for i, f := range p.Friends {
		if strings.EqualFold(f, friendName) {
			p.Friends = append(p.Friends[:i], p.Friends[i+1:]...)
			s.save()
			return *p, true
		}
	}
	return *p, false
}
