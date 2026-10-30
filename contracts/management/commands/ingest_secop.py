from django.conf import settings
from django.core.management.base import BaseCommand

from contracts.ingest import ContractIngestor
from contracts.secop import SocrataSource
from events.bus import get_bus

DEFAULT_SLICE = "departamento='Cauca' AND fecha_de_firma >= '2025-01-01'"


class Command(BaseCommand):
    help = "Loads a slice of SECOP II incrementally and announces the contracts that changed."

    def add_arguments(self, parser):
        parser.add_argument("--where", default=DEFAULT_SLICE, help="A SoQL filter over the dataset")
        parser.add_argument("--max-pages", type=int, default=None, help="Stop after this many pages of 2,000")

    def handle(self, *args, where, max_pages, **options):
        report = ContractIngestor(SocrataSource(settings.SECOP_DATASET), get_bus()).run(where, max_pages=max_pages)
        self.stdout.write(f"pages={report.pages} seen={report.seen} changed={report.changed}")
