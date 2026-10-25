"""Convert the Teachable Machine Keras model to ONNX.

Run once, in the TF 2.15 venv (Keras 3 cannot load this .h5):
    C:\\Users\\Ritvik\\.venvs\\agribot-convert\\Scripts\\python model/convert.py
"""
from __future__ import annotations

import argparse
import pathlib

import tensorflow as tf
import tf2onnx

HERE = pathlib.Path(__file__).parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--h5", default=str(HERE / "source" / "keras_model.h5"))
    parser.add_argument("--out", default=str(HERE / "agribot_tomato_v1.onnx"))
    args = parser.parse_args()

    model = tf.keras.models.load_model(args.h5, compile=False)
    spec = (tf.TensorSpec((None, 224, 224, 3), tf.float32, name="input"),)
    tf2onnx.convert.from_keras(model, input_signature=spec, opset=13, output_path=args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
