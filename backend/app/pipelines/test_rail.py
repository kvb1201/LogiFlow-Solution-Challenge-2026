import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.pipelines.rail import RailPipeline


def test():
    pipeline = RailPipeline()
    routes = pipeline.generate("Surat", "Mumbai")

    print("Generated Routes:")
    for r in routes:
        print(r)


if __name__ == "__main__":
    test()
