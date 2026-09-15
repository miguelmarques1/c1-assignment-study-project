class SessionUser {
  const SessionUser({required this.id, required this.email, required this.displayName});

  factory SessionUser.fromJson(Map<String, dynamic> json) => SessionUser(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['displayName'] as String,
      );

  final String id;
  final String email;
  final String displayName;
}
