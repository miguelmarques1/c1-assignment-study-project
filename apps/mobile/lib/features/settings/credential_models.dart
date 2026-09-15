enum CredentialProvider {
  gemini,
  azureSpeech;

  String get wireValue => this == CredentialProvider.gemini ? 'gemini' : 'azure_speech';

  static CredentialProvider fromWire(String value) =>
      value == 'gemini' ? CredentialProvider.gemini : CredentialProvider.azureSpeech;

  String get label => this == CredentialProvider.gemini ? 'Gemini' : 'Azure Speech';
}

enum CredentialStatus {
  valid,
  invalid,
  unverified,
  missing;

  static CredentialStatus fromWire(String value) => CredentialStatus.values.firstWhere(
    (status) => status.name == value,
    orElse: () => CredentialStatus.missing,
  );

  String get label => switch (this) {
    CredentialStatus.valid => 'Valid',
    CredentialStatus.invalid => 'Invalid',
    CredentialStatus.unverified => 'Not verified',
    CredentialStatus.missing => 'Missing',
  };
}

class MaskedCredential {
  const MaskedCredential({
    required this.provider,
    required this.status,
    required this.maskedKey,
    required this.region,
    required this.lastValidatedAt,
  });

  factory MaskedCredential.fromJson(Map<String, dynamic> json) => MaskedCredential(
    provider: CredentialProvider.fromWire(json['provider'] as String),
    status: CredentialStatus.fromWire(json['status'] as String),
    maskedKey: json['maskedKey'] as String?,
    region: json['region'] as String?,
    lastValidatedAt: json['lastValidatedAt'] == null
        ? null
        : DateTime.parse(json['lastValidatedAt'] as String),
  );

  final CredentialProvider provider;
  final CredentialStatus status;
  final String? maskedKey;
  final String? region;
  final DateTime? lastValidatedAt;

  MaskedCredential copyWith({
    CredentialStatus? status,
    String? maskedKey,
    String? region,
    DateTime? lastValidatedAt,
  }) {
    return MaskedCredential(
      provider: provider,
      status: status ?? this.status,
      maskedKey: maskedKey ?? this.maskedKey,
      region: region ?? this.region,
      lastValidatedAt: lastValidatedAt ?? this.lastValidatedAt,
    );
  }

  /// The reset shape a delete leaves behind — mirrors web's optimistic
  /// client-side update after a 204.
  MaskedCredential asMissing() => MaskedCredential(
    provider: provider,
    status: CredentialStatus.missing,
    maskedKey: null,
    region: null,
    lastValidatedAt: null,
  );
}

const Map<CredentialProvider, String> kMissingCredentialCopy = {
  CredentialProvider.gemini:
      'Without a Gemini key, your lessons will be transcribed and scored but not analyzed, and you will not get a role card.',
  CredentialProvider.azureSpeech: 'Without an Azure Speech key, your lessons cannot be transcribed or scored.',
};
