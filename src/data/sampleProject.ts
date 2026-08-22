import type { ProjectPayload } from "../types";

export const sampleProject: ProjectPayload = {
  name: "ocean_log",
  rootPath: "Demo project",
  environment: { kind: "sample" },
  files: [
    {
      path: "lib/main.dart",
      content: `import 'package:flutter/material.dart';
import 'app.dart';

void main() {
  runApp(const DivexDemo());
}`,
    },
    {
      path: "lib/app.dart",
      content: `import 'package:flutter/material.dart';
import 'screens/home_page.dart';

class DivexDemo extends StatelessWidget {
  const DivexDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: HomePage(),
    );
  }
}`,
    },
    {
      path: "lib/screens/home_page.dart",
      content: `import 'package:flutter/material.dart';
import '../models/dive.dart';
import '../services/dive_service.dart';
import '../widgets/dive_card.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final DiveService service = DiveService();
  List<Dive> dives = [];

  @override
  void initState() {
    super.initState();
    loadDives();
  }

  Future<void> loadDives() async {
    final result = await service.fetchDives();
    setState(() => dives = result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView(
        children: dives.map((dive) => DiveCard(dive: dive)).toList(),
      ),
    );
  }
}`,
    },
    {
      path: "lib/models/dive.dart",
      content: `class Dive {
  const Dive({
    required this.site,
    required this.depth,
    required this.duration,
  });

  final String site;
  final double depth;
  final int duration;

  factory Dive.fromJson(Map<String, dynamic> json) {
    return Dive(
      site: json['site'] as String,
      depth: json['depth'] as double,
      duration: json['duration'] as int,
    );
  }
}`,
    },
    {
      path: "lib/services/dive_service.dart",
      content: `import '../models/dive.dart';

class DiveService {
  Future<List<Dive>> fetchDives() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return const [
      Dive(site: 'Blue Hole', depth: 31.5, duration: 47),
      Dive(site: 'Cedar Pride', depth: 24.0, duration: 52),
    ];
  }
}`,
    },
    {
      path: "lib/widgets/dive_card.dart",
      content: `import 'package:flutter/material.dart';
import '../models/dive.dart';

class DiveCard extends StatelessWidget {
  const DiveCard({required this.dive, super.key});

  final Dive dive;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(dive.site),
        subtitle: Text('\${dive.depth} m · \${dive.duration} min'),
      ),
    );
  }
}`,
    },
    {
      path: "test/widget_test.dart",
      content: `import 'package:flutter_test/flutter_test.dart';
import 'package:ocean_log/app.dart';

void main() {
  testWidgets('shows the home page', (tester) async {
    await tester.pumpWidget(const DivexDemo());
    expect(find.byType(DivexDemo), findsOneWidget);
  });
}`,
    },
    {
      path: "pubspec.yaml",
      content: `name: ocean_log
description: A sample Flutter diving log.
environment:
  sdk: ^3.8.0
dependencies:
  flutter:
    sdk: flutter
`,
    },
  ],
};
